import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual Edge Function, not a copy of its validation/format logic.
// Deno and fetch are exclusively local test doubles. No environment variables,
// network connections, deployed Supabase data or real email providers are used.
const functionUrl = new URL("../../supabase/functions/send-contact-email/index.ts", import.meta.url);
const { outputText, diagnostics } = ts.transpileModule(readFileSync(functionUrl, "utf8"), {
  fileName: functionUrl.pathname,
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
});
assert.equal(diagnostics?.length ?? 0, 0, "The Edge Function must transpile successfully");

const origin = "https://gallery.example.test";
const supabaseUrl = "https://mock-project.supabase.test";
const providerUrl = "https://api.resend.com/emails";
const validPayload = {
  senderName: "Test Visitor",
  senderEmail: "visitor@example.test",
  subject: "Consulta de prueba",
  message: "Primera línea.\n\nSegunda línea.",
  pageUrl: `${origin}/lienzos/horizontes`,
  website: "",
};

function harness({ env = {}, settings, provider } = {}) {
  const values = {
    RESEND_API_KEY: "resend-test-key-not-a-secret",
    CONTACT_FROM_EMAIL: "Website <website@example.test>",
    CONTACT_ALLOWED_ORIGINS: origin,
    CONTACT_RECIPIENT_EMAIL: "fallback@example.test",
    ...env,
  };
  const requests = [];
  const errors = [];
  const environmentReads = [];
  let handler;
  const context = createContext({
    Request, Response, Headers, AbortSignal,
    console: { error: (...arguments_) => errors.push(arguments_) },
    Deno: {
      env: { get(name) { environmentReads.push(name); return values[name]; } },
      serve(callback) { assert.equal(handler, undefined, "Register exactly one request handler"); handler = callback; },
    },
    fetch: async (url, options = {}) => {
      const call = {
        url: String(url), method: options.method ?? "GET", headers: new Headers(options.headers),
        body: options.body ? JSON.parse(options.body) : undefined, signal: options.signal,
      };
      requests.push(call);
      if (call.url === `${supabaseUrl}/rest/v1/site_settings?key=eq.global&select=value`) {
        return settings ? settings(call) : Response.json([{ value: { contact: { email: "artist@example.test" } } }]);
      }
      assert.equal(call.url, providerUrl, "No unrecognized endpoint can be requested");
      return provider ? provider(call) : Response.json({ id: "test-email-id" });
    },
  }, { codeGeneration: { strings: false, wasm: false } });
  new Script(outputText, { filename: functionUrl.pathname }).runInContext(context, { timeout: 1000 });
  assert.equal(typeof handler, "function", "Deno.serve must install its real handler");

  return {
    requests, errors, environmentReads,
    async request({ method = "POST", payload = validPayload, requestOrigin = origin, rawBody } = {}) {
      const headers = { "Content-Type": "application/json", ...(requestOrigin ? { Origin: requestOrigin } : {}) };
      const request = new Request("https://edge.example.test/functions/v1/send-contact-email", {
        method, headers, ...(["GET", "HEAD", "OPTIONS"].includes(method) ? {} : { body: rawBody ?? JSON.stringify(payload) }),
      });
      return handler(request);
    },
  };
}

function assertCors(response, expectedOrigin = origin) {
  assert.equal(response.headers.get("access-control-allow-origin"), expectedOrigin);
  assert.equal(response.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.match(response.headers.get("access-control-allow-headers"), /content-type/);
  assert.equal(response.headers.get("vary"), "Origin");
}

test("contact function: missing provider configuration returns 503 without any outbound request", async (t) => {
  for (const env of [{ RESEND_API_KEY: undefined }, { CONTACT_FROM_EMAIL: undefined }, { RESEND_API_KEY: "", CONTACT_FROM_EMAIL: "" }]) {
    await t.test(Object.keys(env).join(" + "), async () => {
      const edge = harness({ env });
      const response = await edge.request();
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /no está configurado/);
      assertCors(response);
      assert.deepEqual(edge.requests, []);
    });
  }
});

test("contact function: preflight, allowed origins and method validation run before provider configuration", async () => {
  const edge = harness({ env: { CONTACT_ALLOWED_ORIGINS: ` ${origin}/ , https://second.example.test/ `, RESEND_API_KEY: undefined } });
  const preflight = await edge.request({ method: "OPTIONS", requestOrigin: `${origin}/` });
  assert.equal(preflight.status, 200);
  assert.equal(await preflight.text(), "ok");
  assertCors(preflight);
  for (const method of ["GET", "PUT", "DELETE"]) {
    const response = await edge.request({ method });
    assert.equal(response.status, 405);
    assert.match((await response.json()).error, /Método no permitido/);
    assertCors(response);
  }
  for (const method of ["OPTIONS", "POST"]) {
    const response = await edge.request({ method, requestOrigin: "https://other.example.test" });
    assert.equal(response.status, 403);
    assert.match((await response.json()).error, /Origen no permitido/);
    assert.notEqual(response.headers.get("access-control-allow-origin"), "https://other.example.test");
  }
  assert.deepEqual(edge.requests, []);
});

test("contact function: unconfigured origin list supports non-browser requests and reflects explicit browser origins", async () => {
  const edge = harness({ env: { CONTACT_ALLOWED_ORIGINS: "" } });
  const noOrigin = await edge.request({ method: "OPTIONS", requestOrigin: "" });
  assert.equal(noOrigin.status, 200);
  assertCors(noOrigin, "*");
  const otherOrigin = await edge.request({ method: "OPTIONS", requestOrigin: "https://preview.example.test" });
  assertCors(otherOrigin, "https://preview.example.test");
  assert.deepEqual(edge.requests, []);
});

test("contact function: honeypot returns success without querying settings or sending email", async () => {
  const edge = harness({ env: { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: "service-test-key-not-a-secret" } });
  const response = await edge.request({ payload: { website: " https://bot.example.test ", senderEmail: "invalid" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assertCors(response);
  assert.deepEqual(edge.requests, []);
});

test("contact function: malformed JSON and invalid required fields return 400 without outbound requests", async (t) => {
  const cases = [
    { name: "invalid JSON", rawBody: "{not valid JSON" },
    { name: "null JSON", rawBody: "null" },
    { name: "array JSON", rawBody: "[]" },
    { name: "primitive JSON", rawBody: "42" },
    { name: "invalid sender", payload: { ...validPayload, senderEmail: "not-an-email" } },
    { name: "sender with header injection", payload: { ...validPayload, senderEmail: "visitor@example.test\r\nBcc: other@example.test" } },
    { name: "missing subject", payload: { ...validPayload, subject: " \n " } },
    { name: "non-string subject", payload: { ...validPayload, subject: 123 } },
    { name: "missing message", payload: { ...validPayload, message: " " } },
    { name: "non-string message", payload: { ...validPayload, message: { html: "unexpected" } } },
  ];
  for (const fixture of cases) await t.test(fixture.name, async () => {
    const edge = harness();
    const response = await edge.request(fixture);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, "string");
    assertCors(response);
    assert.deepEqual(edge.requests, []);
  });
});

test("contact function: selects the configured recipient and formats plain text artwork details safely", async () => {
  const edge = harness({
    env: { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: "service-test-key-not-a-secret" },
    settings: () => Response.json([{ value: { contact: { email: " artist-updated@example.test " } } }]),
  });
  const response = await edge.request({ payload: {
    ...validPayload, senderName: "  Test Visitor  ", senderEmail: " VISITOR@EXAMPLE.TEST ",
    subject: " Consulta\r\n sobre una obra ", message: " Primera línea.\n\nObra no disponible. ",
    artwork: { title: " Mar sereno ", technique: " Óleo sobre lienzo ", dimensions: " 30 x 30 cm " },
    recipientEmail: "attacker-controlled@example.test",
  } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assertCors(response);
  assert.equal(edge.requests.length, 2);
  const [settings, mail] = edge.requests;
  assert.equal(settings.method, "GET");
  assert.equal(settings.headers.get("apikey"), "service-test-key-not-a-secret");
  assert.equal(settings.headers.get("authorization"), "Bearer service-test-key-not-a-secret");
  assert(settings.signal instanceof AbortSignal, "Recipient lookup is bounded by a request timeout");
  assert.equal(mail.method, "POST");
  assert.equal(mail.headers.get("authorization"), "Bearer resend-test-key-not-a-secret");
  assert(mail.signal instanceof AbortSignal, "Provider delivery is bounded by a request timeout");
  assert.deepEqual(mail.body.to, ["artist-updated@example.test"]);
  assert.equal(mail.body.from, "Website <website@example.test>");
  assert.equal(mail.body.reply_to, "visitor@example.test");
  assert.equal(mail.body.subject, "[Web Toni Crespo] Consulta  sobre una obra");
  assert.equal(mail.body.text, [
    "Nuevo contacto desde tonicrespo.com", "Nombre: Test Visitor", "Correo: visitor@example.test",
    `Página: ${validPayload.pageUrl}`, "", "Obra consultada:", "- Título: Mar sereno",
    "- Técnica: Óleo sobre lienzo", "- Medidas: 30 x 30 cm", "", "Mensaje:", "Primera línea.\n\nObra no disponible.",
  ].join("\n"));
  assert.equal(mail.body.html, undefined, "Untrusted message text must not become HTML");
  assert(!JSON.stringify(mail).includes("service-test-key-not-a-secret"), "Database credentials stay out of email content and provider credentials");
});

test("contact function: unavailable or invalid site settings use only the configured fallback recipient", async (t) => {
  const cases = [
    { name: "no Supabase configuration", env: {} },
    { name: "settings HTTP error", settings: () => Response.json({ error: "temporary" }, { status: 503 }) },
    { name: "settings connection failure", settings: () => { throw new TypeError("Mock settings request failed"); } },
    { name: "invalid settings JSON", settings: () => new Response("not-json", { status: 200 }) },
    { name: "empty settings", settings: () => Response.json([]) },
    { name: "invalid recipient", settings: () => Response.json([{ value: { contact: { email: "not-an-email" } } }]) },
  ];
  for (const fixture of cases) await t.test(fixture.name, async () => {
    const edge = harness({ ...fixture, env: fixture.env ?? { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: "service-test-key-not-a-secret" } });
    const response = await edge.request();
    assert.equal(response.status, 200);
    assert.deepEqual(edge.requests.at(-1).body.to, ["fallback@example.test"]);
  });
});

test("contact function: optional sender/artwork fields are normalized and incoming text is bounded", async () => {
  const edge = harness();
  const response = await edge.request({ payload: {
    ...validPayload, senderName: "n".repeat(200), subject: "s".repeat(240), message: "m".repeat(5100), pageUrl: "p".repeat(2200),
    artwork: { title: "t".repeat(200), technique: "q".repeat(200), dimensions: "d".repeat(150) },
  } });
  assert.equal(response.status, 200);
  const mail = edge.requests[0].body;
  assert.equal(mail.subject, `[Web Toni Crespo] ${"s".repeat(180)}`);
  assert(mail.text.includes(`Nombre: ${"n".repeat(120)}\n`));
  assert(mail.text.includes(`Página: ${"p".repeat(2048)}\n`));
  assert(mail.text.includes(`- Título: ${"t".repeat(180)}\n`));
  assert(mail.text.includes(`- Técnica: ${"q".repeat(180)}\n`));
  assert(mail.text.includes(`- Medidas: ${"d".repeat(120)}\n`));
  assert.equal(mail.text.split("Mensaje:\n")[1], "m".repeat(5000));

  for (const artwork of [undefined, [], { title: " " }, { title: "Obra sin ficha", technique: null, dimensions: 0 }]) {
    const minimal = harness();
    assert.equal((await minimal.request({ payload: { ...validPayload, senderName: null, pageUrl: null, artwork } })).status, 200);
    const text = minimal.requests[0].body.text;
    assert(text.includes("Nombre: No indicado\n"));
    assert(text.includes("Página: No indicada\n"));
    assert(!text.includes("- Técnica:") && !text.includes("- Medidas:"));
    assert.equal(text.includes("Obra consultada:"), artwork?.title === "Obra sin ficha");
  }
});

test("contact function: provider rejection returns a generic 502 with CORS and no false success", async () => {
  const edge = harness({ provider: () => Response.json({ message: "Sensitive provider diagnostic" }, { status: 422 }) });
  const response = await edge.request();
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.match(body.error, /No se pudo enviar el correo/);
  assert.equal(body.ok, undefined);
  assert(!JSON.stringify(body).includes("Sensitive provider diagnostic"));
  assertCors(response);
  assert.equal(edge.requests.length, 1);
});

test("contact function: provider connection failure returns a structured 502 with CORS", async () => {
  const edge = harness({ provider: () => { throw new TypeError("Mock provider connection failed"); } });
  const response = await edge.request();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /No se pudo enviar el correo/);
  assertCors(response);
});

test("contact function: provider timeout returns a structured 502 without retrying delivery", async () => {
  const edge = harness({ provider: () => { throw new DOMException("Mock provider request timed out", "TimeoutError"); } });
  const response = await edge.request();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /No se pudo enviar el correo/);
  assertCors(response);
  assert.equal(edge.requests.length, 1);
});
