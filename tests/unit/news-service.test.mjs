import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function loadTypeScript(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports = {};
  runInNewContext(outputText, { exports, URL, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const presentation = await loadTypeScript("../../src/lib/newsPresentation.ts");
const editing = await loadTypeScript("../../src/lib/newsEditing.ts", { "./newsPresentation": presentation });
const plain = value => JSON.parse(JSON.stringify(value));
const savedId = "10000000-0000-4000-8000-000000000001";
async function fixture({ data = savedId, error = null, configured = true } = {}) {
  const requests = [];
  const service = await loadTypeScript("../../src/services/editableContentService.ts", {
    "../lib/supabaseClient": { isSupabaseConfigured: configured, supabase: configured ? {
      async rpc(name, payload) { requests.push({ name, payload: plain(payload) }); return { data, error }; },
      from() { assert.fail("News saving must not issue non-atomic REST writes or preflight queries"); },
      storage: { from() { assert.fail("Gallery saving must not delete or upload Storage objects"); } },
    } : null },
    "../lib/supportCollections": {},
    "../types/collectionPresentation": {},
    "../lib/newsEditing": editing,
  });
  return { ...service, requests };
}
const input = { title: "  Exposición de otoño  ", publishedAt: "2026-09-13", dateText: " Septiembre ", category: "exposicion",
  location: " Mallorca ", description: "Primer párrafo.\n\nSegundo párrafo.", externalUrl: " https://example.test/noticia?q=arte#galeria ",
  imageAlt: " Alt compartido ", translations: { ca: { title: "Títol", description: "Primera línia.\n\nSegona línia." } } };
const images = [
  { url: "https://example.test/b.jpg", alt: "Legacy independent alt", caption: "  Pie.\n\nSegunda línea.  ", translations: { en: { caption: "Caption\nnext", alt: "Localized alt" } } },
  { url: "https://example.test/a.jpg", alt: null },
];

test("create sends a single atomic RPC preserving ordered captions and translations without truncating prose", async () => {
  const service = await fixture();
  const result = await service.createNewsItem({ ...input, imageUrls: ["https://example.test/ignored.jpg"], images });
  assert.deepEqual(plain(result), { id: savedId });
  assert.equal(service.requests.length, 1);
  assert.deepEqual(service.requests[0], { name: "save_news_item", payload: {
    target_news_id: null,
    news_data: { title: "Exposición de otoño", published_at: "2026-09-13", date_text: "Septiembre", category: "exposicion", location: "Mallorca",
      description: input.description, external_url: input.externalUrl.trim(), image_alt: "Alt compartido", translations: input.translations, slug: "exposicion-de-otono" },
    image_items: images.map(image => ({ image_url: image.url, caption: image.caption ?? null, translations: image.translations ?? {} })),
  } });
});

test("legacy create imageUrls remains compatible and blank optional fields are null", async () => {
  const service = await fixture();
  await service.createNewsItem({ ...input, publishedAt: "", dateText: " ", location: "", description: "", externalUrl: "", imageAlt: "", translations: undefined,
    imageUrls: images.map(image => image.url) });
  const payload = service.requests[0].payload;
  for (const key of ["published_at", "date_text", "location", "description", "external_url"]) assert.equal(payload.news_data[key], null);
  assert.equal(payload.news_data.image_alt, "Exposición de otoño");
  assert.deepEqual(payload.news_data.translations, {});
  assert.deepEqual(payload.image_items, images.map(image => ({ image_url: image.url, caption: null, translations: {} })));
});

test("update omitted images preserves gallery, [] clears it, and supplied order replaces it without resetting publication/slug/sort", async () => {
  const service = await fixture();
  await service.updateNewsItem({ ...input, id: savedId });
  await service.updateNewsItem({ ...input, id: savedId, images: [] });
  await service.updateNewsItem({ ...input, id: savedId, images });
  assert.equal(service.requests[0].payload.image_items, null);
  assert.deepEqual(service.requests[1].payload.image_items, []);
  assert.deepEqual(service.requests[2].payload.image_items.map(image => image.image_url), images.map(image => image.url));
  for (const request of service.requests) {
    assert.equal(request.payload.target_news_id, savedId);
    for (const protectedKey of ["slug", "sort_order", "is_published", "image_url"]) assert.equal(Object.hasOwn(request.payload.news_data, protectedKey), false);
  }
});

test("invalid title, real calendar dates, categories, URLs and localized data fail before any RPC", async () => {
  const service = await fixture();
  const invalid = [
    { title: " \n " }, { title: null }, { publishedAt: "2026-02-30" }, { publishedAt: "2026-13-01" }, { publishedAt: "13/09/2026" },
    { publishedAt: "0000-01-01" }, { category: "other" }, { externalUrl: "javascript:alert(1)" }, { externalUrl: "data:text/html,test" },
    { externalUrl: "https://user:secret@example.test" }, { externalUrl: "https://example.test\\@bad.test" }, { externalUrl: "https://exa\nmple.test" },
    { externalUrl: "http://" }, { translations: [] }, { translations: { en: { description: {} } } }, { imageAlt: 5 },
    { images: null }, { images: [{ url: "data:image/png;base64,abc", alt: null }] }, { images: [{ url: images[0].url, caption: 123 }] },
    { images: [{ url: images[0].url, translations: { ca: null } }] },
  ];
  for (const patch of invalid) await assert.rejects(service.updateNewsItem({ ...input, id: savedId, ...patch }), error => error.code === "22023");
  await assert.rejects(service.createNewsItem({ ...input, imageUrls: [], images: null }), error => error.code === "22023");
  assert.equal(service.requests.length, 0);
});

test("leap day, no date, long paragraphs and optional future translation keys are not falsely rejected", async () => {
  const service = await fixture();
  const description = "Línea completa sin truncar.\n\n".repeat(1000);
  await service.createNewsItem({ ...input, publishedAt: "2024-02-29", description, imageUrls: [], translations: { future: { description, title: null } } });
  assert.equal(service.requests[0].payload.news_data.description, description.trim());
  assert.deepEqual(service.requests[0].payload.news_data.translations, { future: { description, title: null } });
  assert.deepEqual(service.requests[0].payload.image_items, []);
});

test("errors including uncertain network failures preserve their code and never trigger cleanup or fallback writes", async () => {
  for (const error of [
    { code: "P0002", message: "NEWS_NOT_FOUND" }, { code: "42501", message: "NEWS_EDIT_FORBIDDEN" },
    { code: "22023", message: "NEWS_INVALID_INPUT" }, { code: "PGRST202", message: "Could not find save_news_item in schema cache" },
    { message: "Failed to fetch" },
  ]) {
    const service = await fixture({ error });
    await assert.rejects(service.createNewsItem({ ...input, imageUrls: [] }), thrown => thrown === error);
    assert.equal(service.requests.length, 1);
  }
});

test("missing RPC confirmation, missing update id and unconfigured client cannot report a successful save", async () => {
  for (const data of [null, "", {}, []]) {
    const service = await fixture({ data });
    await assert.rejects(service.updateNewsItem({ ...input, id: savedId }), /confirmar.*guardado/);
    assert.equal(service.requests.length, 1);
  }
  const service = await fixture();
  await assert.rejects(service.updateNewsItem({ ...input, id: "" }), /No se encontró/);
  assert.equal(service.requests.length, 0);
  await assert.rejects((await fixture({ configured: false })).createNewsItem({ ...input, imageUrls: [] }), /Supabase/);
});

test("news RPC errors have actionable administrator-facing messages", async () => {
  const { getEditableOperationErrorMessage: message } = await fixture();
  assert.match(message({ message: "Could not find public.save_news_item in the schema cache" }), /activar.*noticias/i);
  assert.match(message({ message: "NEWS_NOT_FOUND" }), /ya no existe/);
  assert.match(message({ message: "NEWS_EDIT_FORBIDDEN" }), /administradora/);
  assert.match(message({ message: "NEWS_INVALID_INPUT" }), /Revisa.*fecha/);
});
