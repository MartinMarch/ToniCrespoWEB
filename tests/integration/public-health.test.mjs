import assert from "node:assert/strict";
import test from "node:test";
import { checkMedia, collectRenderedMedia, publicHealthConfig, runPublicHealth } from "./public-health.mjs";

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

test("required missing email function blocks the deployment health gate", async () => {
  await assert.rejects(runPublicHealth({ env, fetchImpl: mockPublicApi({ emailStatus: 404 }), skipMedia: true, requireEmailFunction: true, log: () => {} }), /OPTIONS: HTTP 404/);
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
