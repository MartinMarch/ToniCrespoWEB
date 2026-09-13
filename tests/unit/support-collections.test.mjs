import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function loadTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  runInNewContext(outputText, { exports, require(name) { throw new Error(`Unexpected dependency: ${name}`); } });
  return exports;
}

const { compareSupportCollections, selectSupportCollections, selectPublicSupportCollections } = await loadTypeScript("../../src/lib/supportCollections.ts");
const { translateEditorialContent } = await loadTypeScript("../../src/data/editorialTranslations.ts");
const plain = value => JSON.parse(JSON.stringify(value));
const work = (id, technique, isPublished = true) => ({ id, technique, caption: "", description: "", isPublished, imageUrl: `${id}.jpg` });
const collection = (id, artworks, extra = {}) => ({ id, slug: id, title: id, source: "legacy-wordpress", supportKind: "canvas", sortOrder: 0,
  isPublished: true, artworks, ...extra });

test("imported collections keep every work regardless of technique, caption or missing editorial text", () => {
  const items = [collection("legacy", [work("canvas", "Acrílico sobre LIÉNZO"), work("paper", "Papel"),
    { ...work("caption", null), caption: "Collage sobre lienzo" }, { ...work("description", null), description: "Técnica mixta en lienzo" }])];
  const before = plain(items);
  const preview = selectSupportCollections(items, "canvas");
  assert.deepEqual(plain(preview[0].artworks.map(item => item.id)), ["canvas", "paper", "caption", "description"]);
  assert.deepEqual(items, before);
  assert.equal(items[0].artworks.length, 4, "The detail page still has all its works");
});

test("all published collections appear within their stored branch, including empty imported collections", () => {
  const items = [collection("legacy-empty", []), collection("legacy-no-match", [work("paper", "Papel")]),
    collection("native-empty", [], { source: "supabase" }), collection("paper-empty", [], { supportKind: "paper" })];
  assert.deepEqual(plain(selectSupportCollections(items, "canvas").map(item => item.id)), ["legacy-empty", "legacy-no-match", "native-empty"]);
  assert.deepEqual(plain(selectSupportCollections(items, "paper").map(item => item.id)), ["paper-empty"]);
});

test("publication and collection sort_order remain authoritative regardless of source", () => {
  const items = [collection("old", [work("old-work", "Lienzo")], { sortOrder: 0 }),
    collection("native", [], { source: "supabase", sortOrder: 20 }),
    collection("first", [work("first-work", "Lienzo")], { sortOrder: 10 }),
    collection("hidden", [work("hidden-work", "Lienzo")], { isPublished: false })];
  assert.deepEqual(plain(selectSupportCollections(items, "canvas").map(item => item.id)), ["old", "first", "native"]);
  items[1].isPublished = false;
  assert.deepEqual(plain(selectSupportCollections(items, "canvas").map(item => item.id)), ["old", "first"]);
});

test("public previews exclude hidden works and their cover images without excluding their collections", () => {
  const items = [collection("only-hidden-match", [work("hidden", "Lienzo", false), work("public", "Papel")]),
    collection("native", [work("hidden-native", "Lienzo", false), work("public-native", "Papel")], { source: "supabase" })];
  const before = plain(items);
  const preview = selectPublicSupportCollections(items, "canvas");
  assert.deepEqual(plain(preview.map(item => item.id)), ["only-hidden-match", "native"]);
  assert.deepEqual(plain(preview[0].artworks.map(item => item.id)), ["public"]);
  assert.equal(preview[0].coverImageUrl, "public.jpg");
  assert.deepEqual(plain(preview[1].artworks.map(item => item.id)), ["public-native"]);
  assert.equal(preview[1].coverImageUrl, "public-native.jpg");
  assert.deepEqual(items, before);
});

test("localizing technique never makes an imported collection disappear", () => {
  const items = [collection("legacy", [{ ...work("localized", "Acrílico sobre lienzo"), translations: { en: { technique: "Acrylic on canvas" } } }])];
  const source = { collections: items, newsItems: [], pages: [], photoItems: [], biography: { page: null, poem: "", galleryImages: [] } };
  for (const language of ["es", "ca", "en", "de"]) {
    const preview = selectPublicSupportCollections(translateEditorialContent(source, language).collections, "canvas");
    assert.equal(preview.length, 1, language);
    assert.equal(preview[0].artworks.length, 1, language);
  }
  assert.equal(source.collections[0].artworks[0].technique, "Acrílico sobre lienzo");
});

test("moving the last work out of a collection leaves both published collections in the index", () => {
  const matching = work("matching", "Lienzo");
  const unrelated = work("unrelated", "Papel");
  const before = [collection("source", [matching]), collection("target", [unrelated])];
  const after = [collection("source", []), collection("target", [unrelated, matching])];
  assert.deepEqual(plain(selectPublicSupportCollections(before, "canvas").map(item => item.id)), ["source", "target"]);
  assert.deepEqual(plain(selectPublicSupportCollections(after, "canvas").map(item => item.id)), ["source", "target"]);
  assert.equal(selectPublicSupportCollections(after, "canvas")[0].coverImageUrl, null);
  assert.equal(after[1].artworks.length, 2, "A new index link will lead to a detail containing both published works");
});

test("recent collections are first even with negative legacy positions and remain hideable", () => {
  const items = [collection("older", [], { source: "supabase", sortOrder: -500 }),
    collection("recent", [], { source: "supabase", sortOrder: 100, isRecent: true }),
    collection("regular", [], { source: "supabase", sortOrder: 0 })];
  assert.deepEqual(plain([...items].sort(compareSupportCollections).map(item => item.id)), ["recent", "older", "regular"]);
  assert.deepEqual(plain(selectSupportCollections(items, "canvas").map(item => item.id)), ["recent", "older", "regular"]);
  items[1].isPublished = false;
  assert.deepEqual(plain(selectPublicSupportCollections(items, "canvas").map(item => item.id)), ["older", "regular"]);
  assert.equal(items[1].isRecent, true);
});
