import assert from "node:assert/strict";
import test from "node:test";
import { checkMedia, collectRenderedMedia, createPublicRequest, publicHealthConfig, runPublicHealth as executePublicHealth } from "./public-health.mjs";

function fastClock() {
  let time = Date.UTC(2026, 8, 8);
  const sleeps = [];
  return { now: () => time, sleep: async (ms) => { sleeps.push(ms); time += ms; }, sleeps };
}

// Exercise production pacing and retries without real timers or remote requests.
const runPublicHealth = (options) => executePublicHealth({ ...options, timing: fastClock() });

const env = { VITE_SUPABASE_URL: "https://supabase.example.invalid", VITE_SUPABASE_ANON_KEY: "sb_publishable_test_only" };
const image = "https://images.example.invalid/artwork.webp";
const fixtures = {
  site_pages: [
    { id: "home", kind: "home", html: "<p>Home</p>", content: {}, translations: {}, is_published: true },
    { id: "bio", kind: "biography", html: "<p>Biography</p>", content: { mainImageUrl: image, galleryImages: [{ url: image }] }, translations: {}, is_published: true },
  ],
  collections: [{ id: "collection", cover_image_url: "https://old.example.invalid/unused.jpg", is_published: true }],
  artworks: [{ id: "artwork", collection_id: "collection", image_url: image, is_published: true, sort_order: 1 }],
  photography_items: [{ id: "photo", image_url: image, is_published: true }],
  news_items: [{ id: "news", image_url: "https://old.example.invalid/unused-news.jpg", is_published: true }],
  news_item_images: [{ id: "news-image", news_item_id: "news", image_url: image }],
  site_settings: [{ key: "global", value: { defaultLanguage: "ca", contact: { email: "contact@example.invalid" } } }],
  admin_users: [],
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function mockPublicApi({ overrides = {}, emailStatus = 200, calls = [] } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), ...init });
    const path = new URL(url).pathname;
    if (path === "/rest/v1/rpc/is_admin") return json(false);
    if (path.startsWith("/rest/v1/")) return json({ ...fixtures, ...overrides }[path.split("/").at(-1)]);
    if (path === "/functions/v1/send-contact-email") return json({ ok: true }, emailStatus);
    return new Response(null, { status: 200, headers: { "content-type": "image/webp", "content-length": "123" } });
  };
}

test("public health fails closed without both public frontend variables", () => {
  assert.throws(() => publicHealthConfig({}), /Se requieren/);
  assert.throws(() => publicHealthConfig({ VITE_SUPABASE_URL: env.VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "secret" }), /Se requieren/);
});

test("public health refuses privileged keys", () => {
  assert.throws(() => publicHealthConfig({ ...env, VITE_SUPABASE_ANON_KEY: "sb_secret_forbidden" }), /rechaza claves secretas/);
  const jwt = `e30.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
  assert.throws(() => publicHealthConfig({ ...env, VITE_SUPABASE_ANON_KEY: jwt }), /nunca service_role/);
});

test("default health checks eight public tables and deduplicated media using only reads", async () => {
  const calls = [];
  const result = await runPublicHealth({ env, fetchImpl: mockPublicApi({ calls }), log: () => {} });
  assert.deepEqual(result, { tables: 8, media: 1, mediaChecked: true, emailChecked: false });
  assert.ok(calls.every((call) => ["GET", "HEAD"].includes(call.method)));
  const adminQuery = calls.find((call) => call.url.includes("/rest/v1/admin_users?"));
  assert.equal(new URL(adminQuery.url).searchParams.get("select"), "created_at");
  const mediaRequest = calls.find((call) => call.url === image);
  assert.equal(mediaRequest.headers, undefined, "Public media requests must never carry Supabase credentials.");
});

test("only rendered image references are checked, not stale covers or news fallbacks", () => {
  assert.deepEqual(collectRenderedMedia(fixtures), [image]);
  const data = { ...fixtures, artworks: [...fixtures.artworks, { collection_id: "hidden-parent", image_url: "https://old.example.invalid/hidden.jpg" }] };
  assert.deepEqual(collectRenderedMedia(data), [image]);
});

test("bad image HTTP status and HTML masquerading as an image fail health", async () => {
  await assert.rejects(checkMedia(image, async () => new Response(null, { status: 404 })), /HTTP 404/);
  await assert.rejects(checkMedia(image, async () => new Response(null, { headers: { "content-type": "text/html" } })), /no devuelve una imagen/);
});

test("HEAD fallback uses a bounded GET Range without Supabase headers", async () => {
  const calls = [];
  await checkMedia(image, async (_url, init) => {
    calls.push(init);
    return init.method === "HEAD" ? new Response(null, { status: 405 }) : new Response("image", { status: 206, headers: { "content-type": "image/webp" } });
  });
  assert.deepEqual(calls, [{ method: "HEAD" }, { method: "GET", headers: { Range: "bytes=0-63" } }]);
});

test("optional legacy diagnostic fails when its email function is missing", async () => {
  await assert.rejects(runPublicHealth({ env, fetchImpl: mockPublicApi({ emailStatus: 404 }), skipMedia: true, requireEmailFunction: true, log: () => {} }), /OPTIONS: HTTP 404/);
});

test("active mailto health succeeds without invoking an unavailable legacy email function", async () => {
  const calls = [];
  const result = await runPublicHealth({ env, fetchImpl: mockPublicApi({ emailStatus: 503, calls }), log: () => {} });
  assert.equal(result.mediaChecked, true);
  assert.equal(result.emailChecked, false);
  assert.ok(calls.every((call) => !call.url.includes("/functions/v1/")));
});

test("contact email follows the frontend mailbox guard including encoded headers and separators", async () => {
  for (const email of [
    null, "", "   ", "not-an-email", "mailto:contact@example.invalid",
    "contact@example.invalid?bcc=other@example.invalid", "contact@example.invalid\r\nBcc: other@example.invalid",
    "contact%0d%0abcc@example.invalid", "contact@example.invalid%3Fsubject=unexpected",
    "contact&extra@example.invalid", '"contact"@example.invalid', "contact\\extra@example.invalid",
    "contact@example.invalid,other@example.invalid", "contact@example.invalid;other@example.invalid",
    "contact#extra@example.invalid", "contact\u0000@example.invalid", "contact\u007f@example.invalid",
    "Display Name <contact@example.invalid>", "con tact@example.invalid",
  ]) {
    await assert.rejects(runPublicHealth({
      env, skipMedia: true, log: () => {},
      fetchImpl: mockPublicApi({ overrides: { site_settings: [{ key: "global", value: { defaultLanguage: "ca", contact: { email } } }] } }),
    }), /correo de contacto debe ser una dirección válida/);
  }
});

test("mailto health matches frontend trimming, plus addressing and mailbox domain rules", async () => {
  for (const email of ["eulaliaricart@gmail.com", "  eulalia.ricart+web@gmail.com  ", "\ncontact@example.invalid\t", "contact@intranet"]) {
    const result = await runPublicHealth({
      env, skipMedia: true, log: () => {},
      fetchImpl: mockPublicApi({ overrides: { site_settings: [{ key: "global", value: { defaultLanguage: "ca", contact: { email } } }] } }),
    });
    assert.equal(result.emailChecked, false);
  }
});

test("email check sends only a honeypot, never actual email fields", async () => {
  const calls = [];
  await runPublicHealth({ env, fetchImpl: mockPublicApi({ calls }), skipMedia: true, requireEmailFunction: true, log: () => {} });
  const writes = calls.filter((call) => call.method === "POST");
  assert.equal(writes.length, 1);
  assert.equal(new URL(writes[0].url).pathname, "/functions/v1/send-contact-email");
  assert.deepEqual(JSON.parse(writes[0].body), { website: "health-check" });
});

test("configured frontend origin must be allowed by email CORS", async () => {
  await assert.rejects(runPublicHealth({
    env: { ...env, PUBLIC_HEALTH_ORIGIN: "https://tonicrespo.example.invalid" },
    fetchImpl: mockPublicApi(), skipMedia: true, requireEmailFunction: true, log: () => {},
  }), /no permite el origen público/);
});

test("empty home content and leaked hidden rows block the deployment health gate", async () => {
  await assert.rejects(runPublicHealth({ env, fetchImpl: mockPublicApi({ overrides: { site_pages: [] } }), skipMedia: true, log: () => {} }), /Falta contenido público/);
  await assert.rejects(runPublicHealth({ env, fetchImpl: mockPublicApi({ overrides: { artworks: [{ ...fixtures.artworks[0], is_published: false }] } }), skipMedia: true, log: () => {} }), /RLS permite leer contenido oculto/);
});

test("transient HTTP errors have only two retries", async () => {
  let calls = 0;
  await assert.rejects(runPublicHealth({ env, fetchImpl: async () => { calls++; return new Response(null, { status: 503 }); }, skipMedia: true, log: () => {} }), /HTTP 503/);
  assert.equal(calls, 3);
});

test("429 and server errors use exponential backoff, then succeed or fail closed", async () => {
  for (const status of [429, 503]) {
    for (const recover of [false, true]) {
      const clock = fastClock();
      const starts = [];
      const request = createPublicRequest({ ...clock, fetchImpl: async () => {
        starts.push(clock.now());
        return new Response(null, { status: recover && starts.length === 3 ? 200 : status });
      } });
      if (recover) assert.equal((await request(image, { method: "HEAD" })).status, 200);
      else await assert.rejects(request(image, { method: "HEAD" }), new RegExp(`HTTP ${status}`));
      assert.deepEqual(starts.map((time) => time - starts[0]), [0, 1_000, 3_000]);
      assert.deepEqual(clock.sleeps, [1_000, 2_000]);
    }
  }
});

test("Retry-After seconds and HTTP dates are honored; invalid or past values use backoff", async () => {
  for (const header of ["3", "Tue, 08 Sep 2026 00:00:03 GMT", "invalid", "-1", "Mon, 07 Sep 2026 00:00:00 GMT"]) {
    const clock = fastClock();
    let calls = 0;
    const request = createPublicRequest({ ...clock, fetchImpl: async () => new Response(null, {
      status: ++calls === 1 ? 429 : 200, headers: { "retry-after": header },
    }) });
    assert.equal((await request(image, { method: "HEAD" })).status, 200);
    assert.deepEqual(clock.sleeps, [header === "3" || header.startsWith("Tue,") ? 3_000 : 1_000]);
  }
});

test("Retry-After beyond the global budget never causes an early retry", async () => {
  const clock = fastClock();
  let calls = 0;
  const request = createPublicRequest({ ...clock, fetchImpl: async () => {
    calls++;
    return new Response(null, { status: 429, headers: { "retry-after": "241" } });
  } });
  await assert.rejects(request(image), /espera requerida supera.*cuatro minutos/);
  assert.equal(calls, 1);
  assert.deepEqual(clock.sleeps, []);
});

test("non-retryable HTTP failures are preserved and HEAD 501 still falls back to GET Range", async () => {
  for (const status of [403, 404]) {
    let calls = 0;
    const request = createPublicRequest({ ...fastClock(), fetchImpl: async () => { calls++; return new Response(null, { status }); } });
    await assert.rejects(checkMedia(image, request), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1);
  }
  const calls = [];
  const request = createPublicRequest({ ...fastClock(), fetchImpl: async (_url, init) => {
    calls.push(init);
    return init.method === "HEAD" ? new Response(null, { status: 501 }) : new Response("image", { status: 206, headers: { "content-type": "image/webp" } });
  } });
  await checkMedia(image, request);
  assert.deepEqual(calls.map(({ method, headers }) => ({ method, headers })), [
    { method: "HEAD", headers: undefined }, { method: "GET", headers: { Range: "bytes=0-63" } },
  ]);
});

test("requests share origin pacing and a 429 cooldown without blocking another origin", async () => {
  let time = Date.UTC(2026, 8, 8);
  const initial = time;
  const waits = [];
  const calls = [];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const request = createPublicRequest({
    now: () => time,
    sleep: (ms) => new Promise((resolve) => waits.push({ at: time + ms, resolve })),
    fetchImpl: async (url) => {
      calls.push({ url, at: time - initial });
      return calls.length === 1 ? new Response(null, { status: 429, headers: { "retry-after": "2" } }) : new Response(null);
    },
  });
  const first = request(image);
  await flush();
  const second = request(`${image}?second`);
  const otherOrigin = request("https://other.example.invalid/image.webp");
  await flush();
  assert.deepEqual(calls.map(({ at }) => at), [0, 0]);
  const advance = async (ms) => {
    time += ms;
    const due = waits.filter(({ at }) => at <= time);
    due.forEach((wait) => { waits.splice(waits.indexOf(wait), 1); wait.resolve(); });
    await flush();
  };
  await advance(1_999);
  assert.equal(calls.length, 2, "Queued workers must not send during the shared cooldown.");
  await advance(1);
  assert.deepEqual(calls[2], { url: image, at: 2_000 });
  await advance(249);
  assert.equal(calls.length, 3);
  await advance(1);
  assert.deepEqual(calls[3], { url: `${image}?second`, at: 2_250 });
  await Promise.all([first, second, otherOrigin]);
});

test("deadline abort cancels pending backoff and fetch receives the abort signal", async () => {
  const controller = new AbortController();
  let calls = 0;
  let fetchSignal;
  const request = createPublicRequest({
    deadline: controller.signal,
    fetchImpl: async (_url, init) => { calls++; fetchSignal = init.signal; return new Response(null, { status: 429 }); },
    sleep: async (_ms, signal) => { assert.equal(signal, controller.signal); controller.abort(); signal.throwIfAborted(); },
  });
  await assert.rejects(request(image), /límite de cuatro minutos/);
  assert.equal(calls, 1);
  assert.equal(fetchSignal.aborted, true);
});
