import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import ts from "typescript";

// Execute the real UI and copy; no browser, network, credentials or Supabase writes.
async function loadTypeScript(path, dependencies = {}, expose = "") {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(`${source}\n${expose}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  });
  const exports = {};
  runInNewContext(outputText, {
    React, exports,
    require(name) {
      if (name === "react") return React;
      if (name === "lucide-react") return icons;
      if (name.endsWith(".css")) return {};
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

const settings = await loadTypeScript("../../src/types/siteSettings.ts");
const { testTranslations } = await loadTypeScript("../../src/app/sitePreferences.tsx", {
  "../services/siteSettingsService": {}, "../lib/siteGradient": {}, "../types/siteSettings": settings,
}, "export const testTranslations = translations;");
let language = "es";
const preferences = {
  useSitePreferences: () => ({ language, labels: testTranslations[language], contactSettings: settings.defaultSiteSettings.contact }),
};
const availability = await loadTypeScript("../../src/components/artworks/ArtworkAvailability.tsx", { "../../app/sitePreferences": preferences });
const dimensions = { ArtworkDimensions: ({ value }) => React.createElement("p", {}, value) };
const loaders = { LoadingImage: props => React.createElement("img", props) };
const adminUi = {
  AdminDialog: ({ title, children }) => React.createElement("section", { "aria-label": title }, children),
  FormMessage: () => null,
};
const { ArtworkCard } = await loadTypeScript("../../src/components/artworks/ArtworkCard.tsx", {
  "../ui/Loaders": loaders, "./ArtworkDimensions": dimensions, "./ArtworkAvailability": availability,
});
const contactHelpers = await loadTypeScript("../../src/lib/contact.ts", { "../types/siteSettings": settings });
const { createArtworkEmailDraft, ArtworkContactDialog } = await loadTypeScript("../../src/components/contact/ContactDialogProvider.tsx", {
  "../../app/sitePreferences": preferences, "../../lib/contact": contactHelpers,
  "../admin/AdminUi": adminUi, "../artworks/ArtworkAvailability": availability,
}, "export { createArtworkEmailDraft, ArtworkContactDialog };");
const localizedFields = await loadTypeScript("../../src/components/admin/LocalizedFields.tsx", {
  "../../types/localization": { contentLocales: ["en", "de", "ca"] },
});
const collectionDescription = await loadTypeScript("../../src/components/support/CollectionDescription.tsx");
const { ArtworkEditorDialog, CollectionEditorDialog } = await loadTypeScript("../../src/components/admin/ContentEditorDialogs.tsx", {
  "../../data/editorialTranslations": {}, "../../app/sitePreferences": preferences,
  "../../services/editableContentService": {}, "../../types/localization": { contentLocales: ["en", "de", "ca"] },
  "./AdminUi": adminUi, "./LocalizedFields": localizedFields,
  "../support/CollectionDescription": collectionDescription,
  "./NewsEditorDialog": {},
});

const artwork = {
  id: "example", collectionSlug: "example", slug: "example", title: "Luz y mar",
  technique: "Óleo", dimensions: "30 × 30 cm", caption: "", description: "",
  imageUrl: "/example.webp", sourceImageUrl: "/example.webp", thumbnailUrl: null,
  width: 300, height: 300, sortOrder: 0, isPublished: true,
};
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const onClose = () => {};
const onSaved = async () => {};

test("shows a translated unavailable badge only for explicit false, including legacy photographs", () => {
  for (const [locale, label] of Object.entries({ es: "No disponible", ca: "No disponible", en: "Unavailable", de: "Nicht verfügbar" })) {
    language = locale;
    assert.equal(render(availability.ArtworkAvailability, { isAvailable: false }), `<small class="artwork-availability">${label}</small>`);
    assert.equal(render(availability.ArtworkAvailability, { isAvailable: true }), "");
    assert.equal(render(availability.ArtworkAvailability, {}), "");
  }
});

test("card availability follows the artwork title without covering or hiding its image and details", () => {
  language = "es";
  const html = render(ArtworkCard, { artwork: { ...artwork, isAvailable: false } });
  assert.match(html, /<h3>Luz y mar<\/h3><small class="artwork-availability">No disponible<\/small>/);
  assert.match(html, /src="\/example.webp"/);
  assert.match(html, /30 × 30 cm/);
  assert.ok(html.indexOf("</a>") < html.indexOf('class="artwork-availability"'));
  assert.doesNotMatch(render(ArtworkCard, { artwork }), /artwork-availability/);
});

test("unavailable contact stays possible with an explicit notice and neutral drafts in every language", () => {
  for (const locale of ["es", "ca", "en", "de"]) {
    language = locale;
    const labels = testTranslations[locale];
    const unavailable = { ...artwork, isAvailable: false };
    const draft = createArtworkEmailDraft(unavailable, labels);
    assert.ok(draft.message.startsWith(labels.actions.inquiryMessagePrefix));
    assert.ok(draft.message.endsWith(labels.actions.inquiryMessageSuffix));
    assert.equal(draft.subject, `${labels.contact.artworkInquirySubjectPrefix}: ${artwork.title}`);
    const html = render(ArtworkContactDialog, { artwork: unavailable, onClose });
    assert.ok(html.includes(labels.contact.unavailableNotice));
    assert.match(html, /class="contact-channel contact-channel--email"/);
    assert.match(html, /class="contact-channel contact-channel--whatsapp"/);
    const emailUrl = new URL(html.match(/href="(mailto:[^"]+)"/)[1].replaceAll("&amp;", "&"));
    assert.equal(emailUrl.searchParams.get("subject"), draft.subject);
    assert.equal(emailUrl.searchParams.get("body"), draft.message);
    const legacyDraft = createArtworkEmailDraft(artwork, labels);
    assert.ok(legacyDraft.message.startsWith(labels.actions.interestMessagePrefix));
    assert.equal(legacyDraft.subject, `${labels.contact.artworkSubjectPrefix}: ${artwork.title}`);
  }
});

test("create and edit forms keep availability and public visibility as independent native checkboxes", () => {
  language = "es";
  const common = { collectionId: "canvas-1", collectionTitle: "Lienzos", onClose, onSaved };
  for (const current of [undefined, artwork]) {
    const html = render(ArtworkEditorDialog, { ...common, artwork: current });
    assert.match(html, /<input type="checkbox" checked=""\/>Disponible/);
    assert.match(html, /<input type="checkbox" checked=""\/>Visible al público/);
  }
  const unavailable = render(ArtworkEditorDialog, { ...common, artwork: { ...artwork, isAvailable: false } });
  assert.match(unavailable, /<input type="checkbox"\/>Disponible/);
  assert.match(unavailable, /<input type="checkbox" checked=""\/>Visible al público/);
  const hidden = render(ArtworkEditorDialog, { ...common, artwork: { ...artwork, isPublished: false } });
  assert.match(hidden, /<input type="checkbox" checked=""\/>Disponible/);
  assert.match(hidden, /<input type="checkbox"\/>Visible al público/);
});

test("new artwork can select a destination only within its branch; existing artwork cannot move through editing", () => {
  language = "es";
  const props = {
    collectionId: "canvas-1", collectionTitle: "Principal", onClose, onSaved,
    collectionOptions: [
      { id: "canvas-1", supportKind: "canvas", title: "Principal" },
      { id: "canvas-2", supportKind: "canvas", title: "Secundaria" },
      { id: "paper-1", supportKind: "paper", title: "Papel" },
    ],
  };
  const html = render(ArtworkEditorDialog, props);
  assert.match(html, /<option value="canvas-1" selected="">Principal<\/option>/);
  assert.match(html, /<option value="canvas-2">Secundaria<\/option>/);
  assert.doesNotMatch(html, /value="paper-1"/);
  assert.doesNotMatch(render(ArtworkEditorDialog, { ...props, artwork }), /<select/);
});

test("recent collection names are disabled while descriptions remain editable", () => {
  language = "es";
  const common = { supportKind: "canvas", onClose, onSaved };
  const collection = { id: "recent", title: "Obras recientes", description: "Descripción original", isRecent: true };
  const html = render(CollectionEditorDialog, { ...common, collection });
  assert.match(html, /Esta colección es permanente/);
  assert.match(html, /<input[^>]*disabled=""[^>]*value="Obras recientes"/);
  assert.match(html, /<textarea rows="5">Descripción original<\/textarea>/);
  assert.doesNotMatch(render(CollectionEditorDialog, { ...common, collection: { ...collection, isRecent: false } }), /disabled=""/);
});

test("existing collection editing starts in the viewed language while creation starts in Spanish", () => {
  const common = { supportKind: "canvas", onClose, onSaved };
  const descriptions = { es: "Descripción base", ca: "Descripció catalana", en: "English description", de: "Deutsche Beschreibung" };
  const collection = { id: "collection", title: "Colección", description: descriptions.es, translations: {
    ca: { title: "Col·lecció", description: descriptions.ca },
    en: { title: "Collection", description: descriptions.en },
    de: { title: "Sammlung", description: descriptions.de },
  } };
  for (const locale of ["es", "ca", "en", "de"]) {
    language = locale;
    const html = render(CollectionEditorDialog, { ...common, collection });
    assert.match(html, new RegExp(`aria-selected="true"><span>${locale.toUpperCase()}</span>`));
    assert.ok(html.includes(`<textarea rows="5">${descriptions[locale]}</textarea>`));
    assert.match(render(CollectionEditorDialog, common), /aria-selected="true"><span>ES<\/span>/);
  }
  language = "es";
});

test("collection editor previews saved alignment and the same Spanish fallback as the public listing", () => {
  const common = { supportKind: "paper", onClose, onSaved };
  const collection = { id: "collection", title: "Papel", description: "Texto base\n\nSegundo párrafo", descriptionAlignment: "center" };
  language = "ca";
  const html = render(CollectionEditorDialog, { ...common, collection });
  assert.match(html, /<input(?=[^>]*value="center")(?=[^>]*checked="")[^>]*\/>/);
  assert.match(html, /<section class="collection-description-preview" aria-label="Vista previa de la descripción">/);
  assert.match(html, /class="collection-description collection-description--center collection-description--compact"><p>Texto base<\/p><p>Segundo párrafo<\/p>/);
  assert.match(html, /Sin traducción en este idioma/);
  const blank = render(CollectionEditorDialog, common);
  assert.match(blank, /<input(?=[^>]*value="justify")(?=[^>]*checked="")[^>]*\/>/);
  assert.doesNotMatch(blank, /<div class="collection-description(?: |")/);
  assert.match(blank, /Escribe una descripción/);
  language = "es";
});
