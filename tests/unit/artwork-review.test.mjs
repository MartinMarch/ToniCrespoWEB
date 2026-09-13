import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../../src/lib/artworkReview.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { getArtworkReviewIssues, getCollectionReviewSummary } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const complete = (extra = {}) => ({ title: "El mar de Ulises", dimensions: "146 x 114 cm", technique: "Acrílico sobre lienzo", imageUrl: "/images/obra.jpg", ...extra });
const dimensionIssues = (dimensions) => getArtworkReviewIssues(complete({ dimensions })).filter((issue) => issue.field === "dimensions");

test("complete metadata needs no description, caption, translations or availability", () => {
  assert.deepEqual(getArtworkReviewIssues(complete()), []);
  assert.deepEqual(getArtworkReviewIssues(complete({ description: "", caption: "", translations: {}, isPublished: false, isAvailable: false })), []);
});

test("missing metadata produces one stable Spanish issue per field", () => {
  assert.deepEqual(getArtworkReviewIssues({ title: " ", dimensions: null, technique: null, imageUrl: "" }), [
    { field: "title", message: "Falta el título." },
    { field: "dimensions", message: "Faltan las medidas." },
    { field: "technique", message: "Falta la técnica." },
    { field: "image", message: "Falta la imagen." },
  ]);
});

test("empty HTML, HTML entities and invisible whitespace do not hide missing fields", () => {
  const empty = "<p> &nbsp; &#160; &#xA0; &emsp; \u200b </p><br>";
  assert.equal(getArtworkReviewIssues({ title: empty, dimensions: empty, technique: empty, imageUrl: "\u200b\n" }).length, 4);
  assert.deepEqual(getArtworkReviewIssues(complete({ title: "<em>El mar</em>", technique: "<p>Acrílico</p>" })), []);
});

test("known camera-name import markers are advisory title issues", () => {
  for (const title of ["IMG_33gh", "IMG_2089", "IMG_3361fd", "016-CIMG2507-scaled", "019-CIMG2518", "img_2089.jpg", "DSC_0012.JPG", "DSCN0123", "IMG_2089-1200x900"]) {
    assert.deepEqual(getArtworkReviewIssues(complete({ title })), [{ field: "title", message: "Revisar el título importado." }], title);
  }
});

test("legitimate untitled, numbered, hyphenated and imported literary titles are not presumed missing", () => {
  for (const title of ["Sin título", "Untitled", "1", "1984", "Brooklyn-Bridge-1", "La-ventana", "225-28x28", "IMG: una mirada", "El cuervo. (Edgar Allan Poe. 1809-1849)"]) {
    assert.deepEqual(getArtworkReviewIssues(complete({ title })), [], title);
  }
});

test("every physical dimension format recorded in the local WordPress export is accepted", () => {
  for (const dimensions of ["146 x 114 cm", "140 x 140 cm", "180 x 90 cm (díptico)", "200 x 100 cm (díptico)", "100 x 100 cm", "180 x 90 cm", "220 x 120 cm", "90 x 90 cm", "20 x20 cm", "20 x 20 cm", "20 X 20 cm"]) {
    assert.deepEqual(dimensionIssues(dimensions), [], dimensions);
  }
});

test("review accepts unitless sizes, mixed units, commas, dots, HTML and circular works", () => {
  for (const dimensions of [
    "120x200", "25 × 25", "50,5 x 40,25 cm", "50.5 × 40.25", "0,8 x 0,6 m", ".8 x .6 m",
    "800 × 600 mm", "80 cm x 60 cm", "50,5 cm × 400 mm", "20 x 10 in", "20 inches x 10 inches", "20″ × 10″", "20” × 10”", "20 x 10 pulgadas",
    "80 cm. x 60 cm.", "<p>80&nbsp;&times;&nbsp;60 cm</p>", "80 &#215; 60 cm", "80 &#xD7; 60 cm", "Ø 40 cm", "ø40", "⌀ 12,5 mm", "Diámetro: 30 cm", "Diámetro de 30 cm", "40 cm de diámetro", "40cm diámetro", "40 cm Ø",
  ]) assert.deepEqual(dimensionIssues(dimensions), [], dimensions);
});

test("valid descriptive, multipart and three-dimensional sizes are not confused with room scale validation", () => {
  for (const dimensions of ["Medidas: 80 x 60 cm", "80 x 60 cm (sin marco)", "80 x 60 cm sin marco", "80 x 60 cm cada panel", "80 x 60 x 3 cm", "80 x 60 cm; 20 x 30 cm", "80 x 60 cm (2 paneles)", "Conjunto total: 180 x 90 cm (díptico)", "80 x 60 cm, sin marco", "80 x 60.", "80 x 60 cm aprox.", "Medidas, 80 x 60 cm"]) {
    assert.deepEqual(dimensionIssues(dimensions), [], dimensions);
  }
});

test("missing and malformed dimensions stay distinct and do not use photo pixels or optional prose", () => {
  for (const dimensions of [null, undefined, "", "  "]) {
    assert.deepEqual(dimensionIssues(dimensions), [{ field: "dimensions", message: "Faltan las medidas." }]);
  }
  for (const dimensions of ["pendiente", "cm", "80", "80 cm", "80 x", "x 60", "0 x 60 cm", "80 x 0 cm", "-80 x 60 cm", "80 x -60 cm", "80 x 60 x -3 cm", "80 x 60x", "80..5 x 60 cm", "80 x 60,5.5 cm", "1/2 x 60 cm", "80 x 60/2 cm", "80-90 x 60 cm", "800 x 600 px", "800 x 600 píxeles", "80 x 60 bananas", "80 x 60 yards"]) {
    assert.deepEqual(dimensionIssues(dimensions), [{ field: "dimensions", message: "Revisar el formato de las medidas." }], dimensions);
  }
  const artwork = complete({ dimensions: null, width: 800, height: 600, description: "80 x 60 cm", caption: "Acrílico" });
  assert.deepEqual(getArtworkReviewIssues(artwork), [{ field: "dimensions", message: "Faltan las medidas." }]);
});

test("summary counts affected works once, includes hidden records and does not mutate draft collections", () => {
  const collection = { artworks: [complete(), complete({ title: "", dimensions: null }), complete({ technique: "", isPublished: false })] };
  const before = structuredClone(collection);
  assert.deepEqual(getCollectionReviewSummary(collection), { artworkCount: 2, issueCount: 3 });
  assert.deepEqual(getCollectionReviewSummary({ artworks: [] }), { artworkCount: 0, issueCount: 0 });
  assert.deepEqual(collection, before);
});
