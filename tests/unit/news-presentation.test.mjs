import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../../src/lib/newsPresentation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exports = {};
runInNewContext(outputText, { exports, URL, Intl });
const { getNewsExternalUrl, getNewsImages, getNewsDate, normalizeNewsSearch, newsCopy, newsCategoryLabels, newsCategoryValues } = exports;

test("news visit links accept HTTP(S) only, without executable schemes, credentials or controls", () => {
  for (const value of [undefined, null, "", "  ", "javascript:alert(1)", "data:text/html,test", "mailto:editor@example.test", "/relative", "//example.test", "https://user:pass@example.test", "https://example.test/\nunsafe", "https:\\example.test"]) {
    assert.equal(getNewsExternalUrl(value), null, String(value));
  }
  for (const value of ["https://example.test/article?language=ca#detail", "http://example.test", "https://exemple.cat/notícia"]) {
    assert.equal(getNewsExternalUrl(`  ${value}  `), value);
  }
});

test("news galleries expose every saved image and preserve captions/translations/order", () => {
  const images = Array.from({ length: 12 }, (_, index) => ({ url: `https://example.test/${index}.jpg`, alt: `Photo ${index}`, caption: "Caption", translations: { ca: { alt: "Foto" } } }));
  assert.equal(getNewsImages({ images, imageUrl: "legacy.jpg" }), images);
  assert.equal(getNewsImages({ images }).length, 12);
  assert.equal(JSON.stringify(getNewsImages({ images: [], imageUrl: "legacy.jpg", imageAlt: "Old alt" })), JSON.stringify([{ url: "legacy.jpg", alt: "Old alt" }]));
  assert.equal(getNewsImages({ images: [], imageUrl: null }).length, 0);
});

test("news search normalizes accents and case without losing editorial punctuation", () => {
  assert.equal(normalizeNewsSearch("  EXPOSICIÓ de Llum  "), "exposicio de llum");
  assert.equal(normalizeNewsSearch("Entrevista: pigments!"), "entrevista: pigments!");
});

test("news dates prefer editorial wording and fall back to the numeric date in every language", () => {
  for (const language of ["es", "ca", "en", "de"]) {
    assert.equal(getNewsDate({ dateText: "Primavera 2026", publishedAt: "2026-06-01" }, language), "Primavera 2026");
    assert.match(getNewsDate({ publishedAt: "2026-06-01" }, language), /2026/);
    assert.equal(getNewsDate({}, language), "");
    assert.equal(getNewsDate({ publishedAt: "not-a-date" }, language), "");
    assert.deepEqual(Object.keys(newsCopy[language]).sort(), Object.keys(newsCopy.es).sort());
    assert.deepEqual(Object.keys(newsCategoryLabels[language]).sort(), [...newsCategoryValues].sort());
  }
});
