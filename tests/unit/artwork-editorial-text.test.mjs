import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}
const { getArtworkEditorialText } = await importTypeScript("../../src/lib/artworkEditorialText.ts");
const { getArtworkMetrics } = await importTypeScript("../../src/lib/artworkRoomGeometry.ts");
const { translateEditorialContent } = await importTypeScript("../../src/data/editorialTranslations.ts");
const showcaseSource = await readFile(new URL("../../src/components/artworks/ArtworkShowcaseList.tsx", import.meta.url), "utf8");
const showcaseCode = ts.transpileModule(showcaseSource.replace(/^import[\s\S]*?;\s*$/gm, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;

const base = {
  id: "example", collectionSlug: "example", slug: "example", title: "El mar de Ulises",
  technique: "Acrílico y collage sobre lienzo", dimensions: "140 x 140 cm", caption: "", description: "",
  imageUrl: "/example.webp", sourceImageUrl: "/example.webp", thumbnailUrl: null,
  width: 1400, height: 1400, sortOrder: 0, isPublished: true,
};
const fixture = (fields = {}) => ({ ...base, ...fields });
const description = "Una descripción nueva de la obra.\n\nObra no disponible";

function renderArtwork(artwork, fullscreen = false) {
  let stateCalls = 0;
  const environment = {
    React, exports: {}, getArtworkEditorialText, getArtworkMetrics, roomScenes: [],
    useEffect: () => {}, useRef: initial => ({ current: initial }), useId: () => "fixture-dialog",
    useMemo: factory => factory(),
    useState: initial => [fullscreen && stateCalls++ === 0 ? artwork : typeof initial === "function" ? initial() : initial, () => {}],
    useSitePreferences: () => ({ labels: { actions: { viewFullscreen: "Ampliar", viewArtworkInRooms: "Ver ambientes", mockups: "Ambientes", interest: "Me interesa", closeImage: "Cerrar" } } }),
    useContactDialog: () => ({ openArtworkContact: () => {} }),
    LoadingImage: props => React.createElement("img", props),
    ArtworkDimensions: ({ value }) => React.createElement("p", { className: "artwork-dimensions" }, value),
  };
  runInNewContext(showcaseCode, environment);
  return renderToStaticMarkup(React.createElement(environment.exports.ArtworkShowcaseList, { artworks: [artwork] }));
}

test("shows every description paragraph even when technique and dimensions exist", () => {
  const artwork = fixture({ description });
  assert.deepEqual(getArtworkEditorialText(artwork), { caption: null, description });
  const html = renderArtwork(artwork);
  assert.match(html, /Acrílico y collage sobre lienzo/);
  assert.match(html, /140 x 140 cm/);
  assert.ok(html.includes(`<p class="artwork-editorial__description">${description}</p>`));
  assert.ok(html.indexOf("artwork-editorial__description") > html.indexOf("artwork-dimensions"));
});

test("fullscreen contains the same description and paragraph breaks", () => {
  const html = renderArtwork(fixture({ description }), true);
  assert.equal(html.match(/class="artwork-editorial__description"/g)?.length, 2);
  assert.equal(html.split(description).length - 1, 2);
  assert.match(html, /artwork-lightbox__caption/);
});

test("removes only duplicate metadata lines and redundant captions", () => {
  const artwork = fixture({
    caption: "«EL MAR DE ULISES»",
    description: "El mar de Ulises\nAcrílico y collage sobre lienzo. 140 x 140 cm.\n\nObra no disponible",
  });
  assert.deepEqual(getArtworkEditorialText(artwork), { caption: null, description: "Obra no disponible" });
  assert.deepEqual(getArtworkEditorialText(fixture({ caption: "Obra no disponible", description })), { caption: null, description });
  assert.deepEqual(getArtworkEditorialText(fixture({ description: "El mar de Ulises" })), { caption: null, description: null });
  assert.deepEqual(getArtworkEditorialText(fixture({ caption: "El mar de Ulises. Acrílico y collage sobre lienzo. 140 x 140 cm." })), { caption: null, description: null });
});

test("preserves a meaningful caption alongside structured metadata and non-duplicate prose", () => {
  const artwork = fixture({ caption: "A Rosa Chacón", description: "El mar de Ulises obtuvo un premio.\n\n---\n\nObra no disponible" });
  assert.deepEqual(getArtworkEditorialText(artwork), { caption: artwork.caption, description: artwork.description });
  assert.match(renderArtwork(artwork), /class="artwork-editorial__caption">A Rosa Chacón<\/p>/);
});

test("treats content as escaped plain text, never HTML", () => {
  const artwork = fixture({ description: '<img src=x onerror=alert(1)>\n\n<script>alert("x")</script>\nObra no disponible' });
  const html = renderArtwork(artwork);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.doesNotMatch(html, /<script|<img src=x/);
});

test("normalizes CRLF without collapsing blank paragraphs or standalone punctuation", () => {
  assert.deepEqual(getArtworkEditorialText(fixture({ description: " \r\nPrimer párrafo.\r\n\r\n---\r\n\r\nObra no disponible\r\n " })), {
    caption: null, description: "Primer párrafo.\n\n---\n\nObra no disponible",
  });
  assert.deepEqual(getArtworkEditorialText(fixture()), { caption: null, description: null });
});

test("uses the selected language and leaves other translations and base data untouched", () => {
  const artwork = fixture({ description, translations: { ca: { description: "Primer paràgraf.\n\nObra no disponible en català" }, en: { description: "First paragraph.\n\nArtwork unavailable" } } });
  const snapshot = { biography: { page: null, poem: "", galleryImages: [] }, collections: [{ artworks: [artwork] }], pages: [], newsItems: [], photoItems: [] };
  const original = structuredClone(snapshot);
  const spanish = translateEditorialContent(snapshot, "es").collections[0].artworks[0];
  const catalan = translateEditorialContent(snapshot, "ca").collections[0].artworks[0];
  const english = translateEditorialContent(snapshot, "en").collections[0].artworks[0];
  assert.equal(getArtworkEditorialText(spanish).description, description);
  assert.equal(getArtworkEditorialText(catalan).description, artwork.translations.ca.description);
  assert.equal(getArtworkEditorialText(english).description, artwork.translations.en.description);
  assert.ok(renderArtwork(catalan).includes("Primer paràgraf.\n\nObra no disponible en català"));
  assert.deepEqual(snapshot, original);
});
