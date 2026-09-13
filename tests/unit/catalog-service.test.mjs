import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function loadTypeScript(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(outputText, { exports, URL, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  } });
  return exports;
}
const support = await loadTypeScript("../../src/lib/supportCollections.ts");
const presentation = await loadTypeScript("../../src/types/collectionPresentation.ts");
const newsPresentation = await loadTypeScript("../../src/lib/newsPresentation.ts");
const newsEditing = await loadTypeScript("../../src/lib/newsEditing.ts", { "./newsPresentation": newsPresentation });
const plain = value => JSON.parse(JSON.stringify(value));

async function serviceFixture({ rows = [], error = null, missing = false, configured = true } = {}) {
  const requests = [];
  const supabase = {
    async rpc(name, payload) {
      requests.push({ method: "rpc", name, payload: plain(payload) });
      return { data: null, error };
    },
    from(table) {
      const request = { table, method: "read", filters: [] };
      const execute = async () => {
        requests.push(plain(request));
        if (error) return { data: null, error };
        if (request.method === "insert") return { data: { id: "created-artwork" }, error: null };
        if (request.method === "update") return { data: missing ? null : { id: request.filters.find(([key]) => key === "id")?.[1] }, error: null };
        if (request.columns === "cover_image_url") return { data: { cover_image_url: null }, error: null };
        return { data: table === "collections" && request.columns.includes("artworks") ? rows : [], error: null };
      };
      const builder = {
        select(columns) { request.columns = columns; return builder; },
        insert(payload) { request.method = "insert"; request.payload = plain(payload); return builder; },
        update(payload) { request.method = "update"; request.payload = plain(payload); return builder; },
        eq(key, value) { request.filters.push([key, value]); return builder; },
        like() { return builder; }, order() { return builder; }, limit() { return builder; },
        single: execute, maybeSingle: execute,
        then(resolve, reject) { return execute().then(resolve, reject); },
      };
      return builder;
    },
  };
  const service = await loadTypeScript("../../src/services/editableContentService.ts", {
    "../lib/supabaseClient": { isSupabaseConfigured: configured, supabase: configured ? supabase : null },
    "../lib/supportCollections": support,
    "../types/collectionPresentation": presentation,
    "../lib/newsEditing": newsEditing,
  });
  return { ...service, requests };
}

const artworkInput = { collectionId: "collection", id: "artwork", title: "Title", caption: "Caption", description: "Line one\nLine two",
  technique: "Acrylic", dimensions: "70 x 90", imageUrl: "https://example.test/art.jpg", width: 70, height: 90 };

test("catalog mapper defaults old flags safely and places recent collections first", async () => {
  const base = { slug: "collection", support_kind: "canvas", title: "Collection", source: "supabase", is_published: true, artworks: [] };
  const service = await serviceFixture({ rows: [
    { ...base, id: "legacy", sort_order: -100, artworks: [{ id: "default", sort_order: 0, is_published: true }, { id: "unavailable", sort_order: 1, is_published: true, is_available: false }] },
    { ...base, id: "recent", sort_order: 100, is_recent: true },
  ] });
  const snapshot = await service.loadEditableContent();
  assert.deepEqual(plain(snapshot.collections.map(item => item.id)), ["recent", "legacy"]);
  assert.equal(snapshot.collections[0].isRecent, true);
  assert.equal(snapshot.collections[1].isRecent, false);
  assert.equal(snapshot.collections[1].artworks[0].isAvailable, true);
  assert.equal(snapshot.collections[1].artworks[1].isAvailable, false);
  assert.ok(service.requests.every(request => request.method === "read"));
});

test("collection editing targets one id and only patches editorial text and timestamp, never branch, recent or visibility flags", async () => {
  for (const supportKind of ["canvas", "paper"]) {
    for (const isRecent of [false, true]) {
      const service = await serviceFixture();
      await service.updateCollection({
        id: `${supportKind}-${isRecent ? "recent" : "ordinary"}`,
        title: isRecent ? "Obras recientes" : "Horizontes",
        description: "Descripción actualizada.",
        translations: {},
        supportKind,
        isRecent,
        isPublished: false,
      });
      assert.equal(service.requests.length, 1, "No artwork, cover, Storage or second collection write");
      const [request] = service.requests;
      assert.equal(request.table, "collections");
      assert.equal(request.method, "update");
      assert.deepEqual(request.filters, [["id", `${supportKind}-${isRecent ? "recent" : "ordinary"}`]]);
      assert.equal(request.columns, "id", "The update verifies the affected row");
      assert.deepEqual(Object.keys(request.payload).sort(), ["description", "title", "translations", "updated_at"]);
      assert.ok(Number.isFinite(Date.parse(request.payload.updated_at)));
    }
  }
});

test("collection descriptions retain internal paragraphs and all supplied translations through save and load", async () => {
  const input = {
    id: "recent-canvas",
    title: "Obras recientes",
    description: "  Primer párrafo.\n\nSegundo párrafo.\nÚltima línea.  ",
    translations: {
      ca: { title: "Obres recents", description: "Primer paràgraf.\n\nSegon paràgraf." },
      en: { title: "Recent works", description: "First paragraph.\n\nSecond paragraph." },
      de: { title: "Neue Werke", description: "Erster Absatz.\n\nZweiter Absatz." },
    },
  };
  const before = structuredClone(input);
  const service = await serviceFixture();
  await service.updateCollection(input);
  const { payload } = service.requests[0];
  assert.equal(payload.description, "Primer párrafo.\n\nSegundo párrafo.\nÚltima línea.");
  assert.deepEqual(payload.translations, input.translations);
  assert.deepEqual(input, before, "Saving does not mutate the editor draft or protected names");

  const reader = await serviceFixture({ rows: [{
    id: input.id, slug: "obras-recientes-lienzos", support_kind: "canvas", source: "supabase",
    is_recent: true, is_published: false, sort_order: -1, artworks: [], ...payload,
  }] });
  const { collections: [loaded] } = await reader.loadEditableContent();
  assert.equal(loaded.description, payload.description);
  assert.deepEqual(plain(loaded.translations), input.translations);
  assert.equal(loaded.title, "Obras recientes");
  assert.equal(loaded.isRecent, true);
  assert.equal(loaded.isPublished, false);
  assert.equal(loaded.supportKind, "canvas");
  assert.equal(loaded.slug, "obras-recientes-lienzos");
});

test("collection updates reject zero affected rows instead of claiming the description was saved", async () => {
  const service = await serviceFixture({ missing: true });
  await assert.rejects(service.updateCollection({ id: "missing", title: "Colección", description: "Texto nuevo", translations: {} }),
    /No se encontró la colección que querías actualizar/);
  assert.equal(service.requests.length, 1);
  assert.deepEqual(service.requests[0].filters, [["id", "missing"]]);
  assert.equal(service.requests[0].columns, "id");
});

test("collection update permission, protection and connection errors propagate without retry or fallback writes", async () => {
  const input = { id: "recent", title: "Obras recientes", description: "Texto nuevo", translations: {} };
  for (const error of [
    { code: "42501", message: "Permission denied" },
    { code: "23514", message: "RECENT_COLLECTION_PROTECTED" },
    { message: "Failed to fetch" },
  ]) {
    const service = await serviceFixture({ error });
    await assert.rejects(service.updateCollection(input), value => value === error);
    assert.equal(service.requests.length, 1);
    assert.equal(service.requests[0].method, "update");
  }
  const unavailable = await serviceFixture({ configured: false });
  await assert.rejects(unavailable.updateCollection(input), /Supabase/);
  assert.equal(unavailable.requests.length, 0);
});

test("collection alignment normalization accepts only the two presentation values and safely defaults legacy data", async () => {
  const values = ["justify", "center", undefined, null, "", "left", "CENTER", " center ", 0, false, {}, ["center"], "center; color:red"];
  for (const value of values) {
    assert.equal(presentation.normalizeCollectionDescriptionAlignment(value), value === "center" ? "center" : "justify");
  }
  const rows = values.map((description_alignment, index) => ({ id: `collection-${index}`, slug: `collection-${index}`, support_kind: "canvas",
    title: "Collection", description: "Text", description_alignment, is_published: true, sort_order: index, artworks: [] }));
  const service = await serviceFixture({ rows });
  const snapshot = await service.loadEditableContent();
  assert.deepEqual(plain(snapshot.collections.map(item => item.descriptionAlignment)), values.map(value => value === "center" ? "center" : "justify"));
  assert.equal(rows[5].description_alignment, "left", "Reading does not alter malformed source rows");
});

test("old collection create and update callers omit alignment rather than overwriting an existing choice", async () => {
  const service = await serviceFixture();
  const input = { id: "existing-centered", supportKind: "canvas", title: "Collection", description: "Text", translations: {} };
  await service.createCollection(input);
  await service.updateCollection(input);
  await service.updateCollection({ ...input, descriptionAlignment: undefined });
  const writes = service.requests.filter(request => ["insert", "update"].includes(request.method));
  assert.equal(writes.length, 3);
  assert.ok(writes.every(request => !Object.hasOwn(request.payload, "description_alignment")));
});

test("explicit collection alignment is saved with editorial fields without changing recent identity, visibility or branch", async () => {
  const input = { id: "recent", supportKind: "paper", title: "Obras recientes", description: "Uno.\n\nDos.",
    translations: { ca: { title: "Obres recents", description: "Un.\n\nDos." } } };
  for (const descriptionAlignment of ["center", "justify"]) {
    const service = await serviceFixture();
    await service.createCollection({ ...input, descriptionAlignment });
    const inserted = service.requests.find(request => request.method === "insert");
    assert.equal(inserted.payload.description_alignment, descriptionAlignment);
    assert.equal(inserted.payload.support_kind, "paper");
    await service.updateCollection({ ...input, descriptionAlignment });
    const updated = service.requests.find(request => request.method === "update");
    assert.equal(updated.payload.description_alignment, descriptionAlignment);
    assert.equal(updated.payload.description, input.description);
    assert.deepEqual(updated.payload.translations, input.translations);
    assert.deepEqual(Object.keys(updated.payload).sort(), ["description", "description_alignment", "title", "translations", "updated_at"]);
    assert.deepEqual(updated.filters, [["id", "recent"]]);
    assert.equal(updated.columns, "id");
  }
});

test("explicit invalid alignment fails before reads or writes rather than silently coercing an administrator choice", async () => {
  const input = { id: "collection", supportKind: "canvas", title: "Collection", description: "Text" };
  for (const descriptionAlignment of [null, "", "left", "CENTER", " center ", 1, {}, ["center"], "center; color:red"]) {
    const service = await serviceFixture();
    await assert.rejects(service.createCollection({ ...input, descriptionAlignment }), /alineación justificada o centrada/);
    await assert.rejects(service.updateCollection({ ...input, descriptionAlignment }), /alineación justificada o centrada/);
    assert.equal(service.requests.length, 0);
  }
});

test("old create and update callers do not overwrite new flags they did not supply", async () => {
  const service = await serviceFixture();
  await service.createArtwork(artworkInput);
  await service.updateArtwork(artworkInput);
  const artworkWrites = service.requests.filter(request => request.table === "artworks" && ["insert", "update"].includes(request.method));
  assert.equal(artworkWrites.length, 2);
  for (const request of artworkWrites) {
    assert.equal(Object.hasOwn(request.payload, "is_available"), false);
    assert.equal(Object.hasOwn(request.payload, "is_published"), false);
    assert.equal(request.payload.description, "Line one\nLine two");
  }
});

test("explicit flags persist independently and creating a hidden artwork cannot set the collection cover", async () => {
  const service = await serviceFixture();
  await service.createArtwork({ ...artworkInput, isPublished: false, isAvailable: false });
  const inserted = service.requests.find(request => request.method === "insert");
  assert.equal(inserted.payload.is_published, false);
  assert.equal(inserted.payload.is_available, false);
  assert.equal(service.requests.some(request => request.table === "collections" && request.method === "update"), false);
  await service.updateArtwork({ ...artworkInput, isAvailable: true });
  const updated = service.requests.find(request => request.method === "update");
  assert.equal(updated.payload.is_available, true);
  assert.equal(Object.hasOwn(updated.payload, "is_published"), false);
});

test("editing without an explicit image replacement leaves all existing image metadata untouched", async () => {
  const service = await serviceFixture();
  await service.updateArtwork(artworkInput);
  assert.equal(service.requests.length, 1);
  const [request] = service.requests;
  for (const field of ["image_url", "thumbnail_url", "source_image_url", "width", "height", "collection_id", "slug", "sort_order"]) {
    assert.equal(Object.hasOwn(request.payload, field), false, field);
  }
  assert.equal(request.columns, "id");
  assert.deepEqual(request.filters, [["id", "artwork"]]);
});

test("an explicit image replacement updates picture, thumbnail and pixels in one row write, preserving source and files", async () => {
  const service = await serviceFixture();
  const replacementImage = { imageUrl: "https://example.test/storage/v1/object/public/artworks/new-uuid.jpg", width: 1600, height: 1200 };
  const translations = { en: { title: "Updated image", description: "Still optional" } };
  await service.updateArtwork({ ...artworkInput, replacementImage, translations, isAvailable: false, isPublished: true });
  assert.equal(service.requests.length, 1, "No Storage cleanup or second cover mutation");
  const [request] = service.requests;
  assert.equal(request.table, "artworks");
  assert.equal(request.method, "update");
  assert.equal(request.payload.image_url, replacementImage.imageUrl);
  assert.equal(request.payload.thumbnail_url, replacementImage.imageUrl);
  assert.equal(request.payload.width, 1600);
  assert.equal(request.payload.height, 1200);
  assert.equal(Object.hasOwn(request.payload, "source_image_url"), false);
  assert.equal(Object.hasOwn(request.payload, "collection_id"), false);
  assert.equal(Object.hasOwn(request.payload, "slug"), false);
  assert.equal(request.payload.is_available, false);
  assert.equal(request.payload.is_published, true);
  assert.deepEqual(request.payload.translations, translations);
  assert.equal(request.payload.description, "Line one\nLine two");
  assert.deepEqual(request.filters, [["id", "artwork"]]);
});

test("blank replacement URLs fail before writing and can never erase the current image", async () => {
  const service = await serviceFixture();
  await assert.rejects(service.updateArtwork({ ...artworkInput, replacementImage: { imageUrl: "  ", width: 100, height: 100 } }), /imagen nueva/);
  assert.equal(service.requests.length, 0);
});

test("replacement errors and zero affected rows reject without deleting any potentially referenced upload", async () => {
  const input = { ...artworkInput, replacementImage: { imageUrl: "https://example.test/new.jpg", width: 1600, height: 1200 } };
  const missing = await serviceFixture({ missing: true });
  await assert.rejects(missing.updateArtwork(input), /No se encontró la obra/);
  assert.equal(missing.requests.length, 1);
  for (const error of [{ code: "42501", message: "Permission denied" }, { message: "Failed to fetch" }]) {
    const failed = await serviceFixture({ error });
    await assert.rejects(failed.updateArtwork(input), value => value === error);
    assert.equal(failed.requests.length, 1);
  }
});

test("availability and collection visibility toggles update only their flag and timestamp", async () => {
  const service = await serviceFixture();
  await service.updateArtworkAvailability({ id: "art", isAvailable: false });
  await service.updateCollectionVisibility({ id: "recent", isPublished: false });
  assert.deepEqual(service.requests.map(request => [request.table, request.filters]), [
    ["artworks", [["id", "art"]]], ["collections", [["id", "recent"]]],
  ]);
  assert.deepEqual(Object.keys(service.requests[0].payload).sort(), ["is_available", "updated_at"]);
  assert.deepEqual(Object.keys(service.requests[1].payload).sort(), ["is_published", "updated_at"]);
  assert.equal(service.requests[0].payload.is_available, false);
  assert.equal(service.requests[1].payload.is_published, false);
});

test("toggle errors and missing rows reject rather than falsely reporting success", async () => {
  const missing = await serviceFixture({ missing: true });
  await assert.rejects(missing.updateArtworkAvailability({ id: "missing", isAvailable: true }), /No se encontró/);
  await assert.rejects(missing.updateCollectionVisibility({ id: "missing", isPublished: true }), /No se encontró/);
  const error = { code: "42501", message: "Permission denied" };
  const rejected = await serviceFixture({ error });
  await assert.rejects(rejected.updateArtworkAvailability({ id: "art", isAvailable: false }), value => value === error);
  const unavailable = await serviceFixture({ configured: false });
  await assert.rejects(unavailable.updateCollectionVisibility({ id: "recent", isPublished: false }), /Supabase/);
});

test("safe collection removal is a single atomic RPC, without storage or cascading table delete calls", async () => {
  const service = await serviceFixture();
  await service.deleteEmptyCollection({ id: "empty" });
  assert.deepEqual(service.requests, [{ method: "rpc", name: "delete_empty_collection", payload: { target_collection_id: "empty" } }]);
  const failure = { code: "23514", message: "COLLECTION_NOT_EMPTY" };
  const rejected = await serviceFixture({ error: failure });
  await assert.rejects(rejected.deleteEmptyCollection({ id: "full" }), value => value === failure);
  assert.equal(rejected.requests.length, 1);
});

test("manager artwork removal preserves potentially shared files and only deletes the requested row", async () => {
  const service = await serviceFixture();
  await service.deleteArtwork({ id: "artwork", imageUrl: "https://example.test/storage/v1/object/public/artworks/shared.jpg", preserveAssets: true });
  assert.deepEqual(service.requests, [{ method: "rpc", name: "delete_artwork_with_cover_refresh", payload: { target_artwork_id: "artwork" } }]);
});

test("catalog errors explain branch, permanent, nonempty and missing-migration failures", async () => {
  const { getEditableOperationErrorMessage: message } = await serviceFixture();
  assert.match(message({ message: "ARTWORK_BRANCH_MISMATCH" }), /secciones independientes/);
  assert.match(message({ message: "RECENT_COLLECTION_PROTECTED" }), /permanente/);
  assert.match(message({ message: "COLLECTION_NOT_EMPTY" }), /todavía contiene obras/);
  assert.match(message({ message: "COLLECTION_NOT_FOUND" }), /ya no existe/);
  assert.match(message({ message: "is_available column missing from schema cache" }), /20260912144600_artwork_catalog_branches.sql/);
  assert.match(message({ message: "delete_empty_collection missing from schema cache" }), /20260912144600_artwork_catalog_branches.sql/);
  assert.match(message({ message: "Could not find the description_alignment column of collections in the schema cache" }), /20260913093831_collection_description_alignment.sql/);
});
