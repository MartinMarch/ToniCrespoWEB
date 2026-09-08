import type { Locator, Page } from "@playwright/test";
import { test, expect, type MockSupabaseBackend } from "../helpers/mock-supabase";

// These tests use the complete application, including its actual Auth, content
// services, translation helpers and uploads. Only HTTP responses are simulated.
// Each test gets fresh backend/browser state and runs on desktop and touch mobile.
const image = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=", "base64"),
});

type TestBackend = MockSupabaseBackend;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("editing-test-language-initialized")) {
      localStorage.setItem("toni-crespo-language", "es");
      sessionStorage.setItem("editing-test-language-initialized", "yes");
    }
  });
});

async function login(page: Page, backend: TestBackend, path = "/") {
  await page.goto(path);
  await page.getByRole("button", { name: "Edición web", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Inicio de sesión de edición" });
  await dialog.getByLabel("Email admin").fill(backend.admin.email);
  await dialog.getByLabel("Contraseña").fill(backend.admin.password);
  await dialog.getByRole("button", { name: "Entrar en modo edición" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Salir de edición", exact: true })).toBeVisible();
}

async function selectLocale(dialog: Locator, locale: "ES" | "CA" | "EN" | "DE") {
  await dialog.getByRole("tab").filter({ has: dialog.page().locator("span", { hasText: new RegExp(`^${locale}$`) }) }).click();
}

async function selectLanguage(page: Page, name: "Español" | "Català" | "English" | "Deutsch") {
  await page.locator(".header-language__trigger").click();
  await page.getByRole("menuitemradio", { name, exact: true }).click();
  await expect(page.getByRole("menu")).toBeHidden();
}

async function createCollection(page: Page, title: string) {
  await page.getByRole("button", { name: /^Crear colección de / }).click();
  const dialog = page.getByRole("dialog", { name: /^Nueva colección de / });
  await dialog.getByLabel("Nombre", { exact: true }).fill(title);
  await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Colección creada desde el editor de prueba.");
  await dialog.getByRole("button", { name: "Crear colección", exact: true }).click();
  await expect(dialog).toBeHidden();
  return page.locator(".support-collection-preview-card").filter({ has: page.locator(".support-collection-preview-card__title", { hasText: title }) });
}

async function createArtwork(page: Page, title: string, description = "Primera línea.\n\nObra no disponible.") {
  await page.getByRole("button", { name: "Añadir obra", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Añadir obra a / });
  await dialog.getByLabel("Título", { exact: true }).fill(title);
  await dialog.getByLabel("Técnica", { exact: true }).fill("Óleo sobre lienzo");
  await dialog.getByLabel("Dimensiones", { exact: true }).fill("30 x 30 cm");
  await dialog.getByLabel("Pie de obra", { exact: true }).fill("Pie independiente de la descripción.");
  await dialog.getByRole("textbox", { name: /^Descripción/ }).fill(description);
  await dialog.locator('input[type="file"]').setInputFiles(image(`${title}.png`));
  await dialog.getByRole("button", { name: "Añadir obra", exact: true }).click();
  await expect(dialog).toBeHidden();
  const card = page.locator(".artwork-showcase").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(card).toBeVisible();
  return card;
}

test("admin login: rejects invalid credentials and non-admin accounts; toggles edition and signs out", async ({ page, backend }) => {
  await page.goto("/lienzos");
  await expect(page.getByRole("button", { name: /^Crear colección de / })).toHaveCount(0);
  await page.getByRole("button", { name: "Edición web", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Inicio de sesión de edición" });
  await dialog.getByLabel("Email admin").fill(backend.admin.email);
  await dialog.getByLabel("Contraseña").fill("incorrect-password");
  await dialog.getByRole("button", { name: "Entrar en modo edición" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email admin").fill(backend.nonAdmin.email);
  await dialog.getByLabel("Contraseña").fill(backend.nonAdmin.password);
  await dialog.getByRole("button", { name: "Entrar en modo edición" }).click();
  await expect(dialog.getByRole("alert")).toContainText("no tiene permisos de administración");
  await expect(page.getByRole("button", { name: /^Crear colección de / })).toHaveCount(0);
  await dialog.getByLabel("Email admin").fill(backend.admin.email);
  await dialog.getByLabel("Contraseña").fill(backend.admin.password);
  await dialog.getByRole("button", { name: "Entrar en modo edición" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /^Crear colección de / })).toBeVisible();
  await page.getByRole("button", { name: "Salir de edición", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Crear colección de / })).toHaveCount(0);
  await page.getByRole("button", { name: "Edición web", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Crear colección de / })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Crear colección de / })).toHaveCount(0);
  await page.getByRole("button", { name: "Edición web", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar inicio de sesión" }).click();
  await expect(dialog).toBeHidden();
});

test("admin login refreshes public data so previously hidden artwork becomes editable without a page reload", async ({ page, backend }) => {
  await page.goto("/lienzos/horizontes");
  await expect(page.getByRole("heading", { name: "Mar sereno", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Obra reservada", exact: true })).toHaveCount(0);
  await backend.signIn(page);
  await expect(page.getByRole("heading", { name: "Obra reservada", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mostrar obra: Obra reservada", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Obra reservada", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mostrar obra: Obra reservada", exact: true })).toHaveCount(0);
});

for (const support of [{ path: "/lienzos", kind: "canvas" }, { path: "/laminas", kind: "paper" }] as const) {
  test(`${support.kind}: creates an empty collection, uploads artwork, edits paragraphs/translations, hides and deletes safely`, async ({ page, backend }) => {
    await login(page, backend, support.path);
    const title = `Colección de prueba ${support.kind}`;
    const preview = await createCollection(page, title);
    await expect(preview.locator(".support-collection-preview-card__empty")).toBeVisible();
    await expect(preview.locator(".support-collection-preview-card__artwork")).toHaveCount(0);
    const collection = backend.state.tables.collections.find((row) => row.title === title)!;
    expect(collection.support_kind).toBe(support.kind);
    await preview.locator(".support-collection-preview-card__link").click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.locator("article.artwork-showcase")).toHaveCount(0);

    const artworkTitle = `Obra de prueba ${support.kind}`;
    const card = await createArtwork(page, artworkTitle);
    const saved = backend.state.tables.artworks.find((row) => row.title === artworkTitle)!;
    expect(saved.collection_id).toBe(collection.id);
    expect(saved.description).toBe("Primera línea.\n\nObra no disponible.");
    expect(saved.image_url).toContain("/storage/v1/object/public/artworks/");
    expect(saved.width).toBe(1);
    expect(saved.height).toBe(1);
    await expect(card.locator(".artwork-editorial__description")).toHaveText("Primera línea.\n\nObra no disponible.");
    await expect(card.locator(".artwork-editorial__description")).toHaveCSS("white-space", "pre-line");

    await card.getByRole("button", { name: `Editar obra: ${artworkTitle}`, exact: true }).click();
    let dialog = page.getByRole("dialog", { name: /^Editar obra de / });
    await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Descripción editada.\n\nObra no disponible.\nInformación adicional.");
    await selectLocale(dialog, "CA");
    await dialog.getByLabel("Título", { exact: true }).fill(`Obra catalana ${support.kind}`);
    await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Descripció catalana.\n\nObra no disponible.");
    await selectLocale(dialog, "EN");
    await dialog.getByLabel("Título", { exact: true }).fill(`English artwork ${support.kind}`);
    await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("English description.\n\nArtwork unavailable.");
    await dialog.getByRole("button", { name: "Guardar obra", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(card.locator(".artwork-editorial__description")).toContainText("Información adicional.");
    await selectLanguage(page, "Català");
    await page.getByRole("button", { name: `Editar obra: Obra catalana ${support.kind}`, exact: true }).click();
    dialog = page.getByRole("dialog", { name: /^Editar obra de / });
    await expect(dialog.getByRole("tab", { selected: true })).toContainText("CA");
    await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Descripció catalana revisada.\n\nObra no disponible.");
    await dialog.getByRole("button", { name: "Guardar obra", exact: true }).click();
    await expect(dialog).toBeHidden();
    const revised = backend.state.tables.artworks.find((row) => row.id === saved.id)!;
    expect(revised.description).toBe("Descripción editada.\n\nObra no disponible.\nInformación adicional.");
    expect(revised.translations.ca.description).toBe("Descripció catalana revisada.\n\nObra no disponible.");
    expect(revised.translations.en.description).toBe("English description.\n\nArtwork unavailable.");
    await selectLanguage(page, "Español");

    await card.getByRole("button", { name: `Ocultar obra: ${artworkTitle}`, exact: true }).click();
    await expect(card.getByText("Oculta al público", { exact: true })).toBeVisible();
    expect(backend.state.tables.artworks.find((row) => row.id === saved.id)?.is_published).toBe(false);
    await page.getByRole("button", { name: "Salir de edición", exact: true }).click();
    await expect(page.getByRole("heading", { name: artworkTitle, exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Edición web", exact: true }).click();
    await card.getByRole("button", { name: `Mostrar obra: ${artworkTitle}`, exact: true }).click();
    await expect(card.getByText("Oculta al público", { exact: true })).toHaveCount(0);

    await card.getByRole("button", { name: `Eliminar obra: ${artworkTitle}`, exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "Eliminar obra", exact: true });
    await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: `Eliminar obra: ${artworkTitle}`, exact: true }).click();
    await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(confirmation).toBeHidden();
    await expect(card).toHaveCount(0);
    expect(backend.state.tables.artworks.some((row) => row.id === saved.id)).toBe(false);
    expect(backend.state.tables.collections.find((row) => row.id === collection.id)?.cover_image_url).toBeFalsy();

    await page.goto(support.path);
    await page.getByRole("button", { name: "Edición web", exact: true }).click();
    await page.getByRole("button", { name: `Editar colección: ${title}`, exact: true }).click();
    const collectionDialog = page.getByRole("dialog", { name: /^Editar colección de / });
    await collectionDialog.getByLabel("Nombre", { exact: true }).fill(`${title} revisada`);
    await collectionDialog.getByRole("textbox", { name: /^Descripción/ }).fill("Descripción de colección revisada.");
    await collectionDialog.getByRole("button", { name: "Guardar colección", exact: true }).click();
    await expect(collectionDialog).toBeHidden();
    await page.getByRole("button", { name: `Eliminar colección: ${title} revisada`, exact: true }).click();
    const deleteCollection = page.getByRole("dialog", { name: "Eliminar colección", exact: true });
    await deleteCollection.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(page.getByRole("button", { name: `Editar colección: ${title} revisada`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Eliminar colección: ${title} revisada`, exact: true }).click();
    await deleteCollection.getByRole("button", { name: "Eliminar", exact: true }).click();
    await expect(deleteCollection).toBeHidden();
    expect(backend.state.tables.collections.some((row) => row.id === collection.id)).toBe(false);
  });
}

test("failed artwork save shows feedback, retains paragraph draft and can be retried", async ({ page, backend }) => {
  await login(page, backend, "/lienzos");
  const preview = await createCollection(page, "Colección de errores");
  await preview.locator(".support-collection-preview-card__link").click();
  const card = await createArtwork(page, "Obra con reintento");
  await card.getByRole("button", { name: "Editar obra: Obra con reintento", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Editar obra de / });
  const draft = "Borrador conservado.\n\nObra no disponible.";
  await dialog.getByRole("textbox", { name: /^Descripción/ }).fill(draft);
  backend.failNext({ table: "artworks", method: "PATCH", status: 500, message: "Error temporal de prueba" });
  await dialog.getByRole("button", { name: "Guardar obra", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /^Descripción/ })).toHaveValue(draft);
  await expect(card.locator(".artwork-editorial__description")).not.toContainText("Borrador conservado");
  await dialog.getByRole("button", { name: "Guardar obra", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card.locator(".artwork-editorial__description")).toHaveText(draft);
});

test("artwork upload failure keeps its draft, creates no row and supports a successful retry", async ({ page, backend }) => {
  await login(page, backend, "/lienzos");
  const preview = await createCollection(page, "Colección de subida");
  await preview.locator(".support-collection-preview-card__link").click();
  await page.getByRole("button", { name: "Añadir obra", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Añadir obra a / });
  await dialog.getByLabel("Título", { exact: true }).fill("Obra con subida reintentada");
  await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Texto conservado.\n\nObra no disponible.");
  await dialog.locator('input[type="file"]').setInputFiles(image("obra-reintento.png"));
  const initialCount = backend.state.tables.artworks.length;
  backend.failNext({ path: "/storage/v1/object/", method: "POST", status: 500, message: "Fallo temporal de subida" });
  await dialog.getByRole("button", { name: "Añadir obra", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: /^Descripción/ })).toHaveValue("Texto conservado.\n\nObra no disponible.");
  expect(backend.state.tables.artworks).toHaveLength(initialCount);
  await dialog.getByRole("button", { name: "Añadir obra", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Obra con subida reintentada", exact: true })).toBeVisible();
  expect(backend.state.tables.artworks).toHaveLength(initialCount + 1);
});

test("failed artwork creation removes the uploaded orphan image and preserves the editor for retry", async ({ page, backend }) => {
  await login(page, backend, "/lienzos/horizontes");
  await page.getByRole("button", { name: "Añadir obra", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /^Añadir obra a / });
  await dialog.getByLabel("Título", { exact: true }).fill("Obra con creación reintentada");
  await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Borrador que debe conservarse.");
  await dialog.locator('input[type="file"]').setInputFiles(image("imagen-recuperable.png"));
  const initialCount = backend.state.tables.artworks.length;
  backend.failNext({ table: "artworks", method: "POST", status: 500, message: "No se pudo crear la obra de prueba" });
  await dialog.getByRole("button", { name: "Añadir obra", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(backend.state.tables.artworks).toHaveLength(initialCount);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toContain(backend.state.uploads[0]);
  expect(backend.state.storage[backend.state.uploads[0]]).toBeUndefined();
  await expect(dialog.getByRole("textbox", { name: /^Descripción/ })).toHaveValue("Borrador que debe conservarse.");
  await dialog.getByRole("button", { name: "Añadir obra", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("heading", { name: "Obra con creación reintentada", exact: true })).toBeVisible();
  expect(backend.state.tables.artworks).toHaveLength(initialCount + 1);
  expect(backend.state.uploads).toHaveLength(2);
  expect(backend.state.storage[backend.state.uploads[1]]).toBeDefined();
});

test("collection cancellation performs no write; confirmed populated deletion removes its artworks and owned assets", async ({ page, backend }) => {
  await login(page, backend, "/lienzos");
  const initialCount = backend.state.tables.collections.length;
  await page.getByRole("button", { name: /^Crear colección de / }).click();
  const creation = page.getByRole("dialog", { name: /^Nueva colección de / });
  await creation.getByLabel("Nombre", { exact: true }).fill("Borrador no guardado");
  await creation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(creation).toBeHidden();
  expect(backend.state.tables.collections).toHaveLength(initialCount);
  const preview = await createCollection(page, "Colección con dos obras");
  await preview.locator(".support-collection-preview-card__link").click();
  await createArtwork(page, "Primera obra de colección");
  await createArtwork(page, "Segunda obra de colección");
  const collection = backend.state.tables.collections.find((row) => row.title === "Colección con dos obras")!;
  expect(backend.state.tables.artworks.filter((row) => row.collection_id === collection.id)).toHaveLength(2);
  const initialDeletedAssets = backend.state.deletedAssets.length;
  await page.goto("/lienzos");
  await page.getByRole("button", { name: "Edición web", exact: true }).click();
  await page.getByRole("button", { name: "Eliminar colección: Colección con dos obras", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Eliminar colección", exact: true });
  await expect(confirmation).toContainText("2 obras");
  await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  expect(backend.state.tables.collections.some((row) => row.id === collection.id)).toBe(false);
  expect(backend.state.tables.artworks.some((row) => row.collection_id === collection.id)).toBe(false);
  expect(backend.state.deletedAssets.length).toBe(initialDeletedAssets + 2);
});

test("photography: uploads multiple images, edits title/alt/translations and confirms deletion", async ({ page, backend }) => {
  await login(page, backend, "/fotografia");
  const initial = backend.state.tables.photography_items.length;
  await page.locator('.photography-page input[type="file"]').setInputFiles([image("foto-nueva-uno.png"), image("foto-nueva-dos.png")]);
  await expect.poll(() => backend.state.tables.photography_items.length).toBe(initial + 2);
  await page.getByRole("button", { name: "Editar fotografía: foto nueva uno", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar fotografía", exact: true });
  await dialog.getByLabel("Título", { exact: true }).fill("Fotografía revisada");
  await dialog.getByLabel("Texto alternativo", { exact: true }).fill("Retrato de prueba accesible");
  await selectLocale(dialog, "EN");
  await dialog.getByLabel("Título", { exact: true }).fill("Updated photograph");
  await dialog.getByLabel("Texto alternativo", { exact: true }).fill("Accessible test portrait");
  await dialog.getByRole("button", { name: "Guardar fotografía", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("img", { name: "Retrato de prueba accesible", exact: true })).toBeVisible();
  const saved = backend.state.tables.photography_items.find((row) => row.title === "Fotografía revisada")!;
  expect(saved.translations.en.imageAlt).toBe("Accessible test portrait");
  await page.getByRole("button", { name: "Eliminar fotografía: Fotografía revisada", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Eliminar fotografía", exact: true });
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("img", { name: "Retrato de prueba accesible", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Eliminar fotografía: Fotografía revisada", exact: true }).click();
  await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect.poll(() => backend.state.tables.photography_items.length).toBe(initial + 1);
  await expect(page.getByRole("img", { name: "Retrato de prueba accesible", exact: true })).toHaveCount(0);
});

test("news: uploads an image gallery, edits fields and translations, preserves images and deletes the complete item", async ({ page, backend }) => {
  await login(page, backend, "/noticias");
  await page.getByRole("button", { name: "Añadir noticia", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Añadir noticia", exact: true });
  await dialog.getByLabel("Título", { exact: true }).fill("Noticia de prueba editorial");
  await dialog.getByLabel("Fecha", { exact: true }).fill("2026-09-08");
  await dialog.getByLabel("Fecha visible", { exact: true }).fill("Septiembre de 2026");
  await dialog.getByRole("combobox", { name: /^Categoría/ }).selectOption("exposicion");
  await dialog.getByLabel("Ubicación", { exact: true }).fill("Mallorca");
  await dialog.getByLabel("Enlace externo", { exact: true }).fill("https://example.com/exposicion");
  await dialog.getByRole("textbox", { name: /^Descripción/ }).fill("Descripción de noticia de prueba.");
  await dialog.getByLabel("Texto alternativo de imágenes", { exact: true }).fill("Imagen de exposición de prueba");
  await dialog.locator('input[type="file"]').setInputFiles([image("noticia-uno.png"), image("noticia-dos.png")]);
  await dialog.getByRole("button", { name: "Crear noticia", exact: true }).click();
  await expect(dialog).toBeHidden();
  const card = page.locator(".news-card").filter({ has: page.getByRole("heading", { name: "Noticia de prueba editorial", exact: true }) });
  await expect(card.locator(".news-card__zoom-button")).toHaveCount(2);
  await expect(card.getByRole("link", { name: "Visitar aquí", exact: true })).toHaveAttribute("href", "https://example.com/exposicion");
  const row = backend.state.tables.news_items.find((item) => item.title === "Noticia de prueba editorial")!;
  const savedImages = backend.state.tables.news_item_images.filter((item) => item.news_item_id === row.id);
  expect(savedImages).toHaveLength(2);
  await card.getByRole("button", { name: "Editar noticia: Noticia de prueba editorial", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Editar noticia", exact: true });
  await edit.getByRole("textbox", { name: /^Descripción/ }).fill("Descripción revisada desde el formulario.");
  await edit.getByLabel("Texto alternativo de imágenes", { exact: true }).fill("Exposición con texto alternativo actualizado");
  await edit.getByRole("combobox", { name: /^Categoría/ }).selectOption("premio");
  await selectLocale(edit, "EN");
  await edit.getByLabel("Título", { exact: true }).fill("Editorial test news");
  await edit.getByRole("textbox", { name: /^Descripción/ }).fill("Edited English description.");
  await edit.getByLabel("Texto alternativo de imágenes", { exact: true }).fill("Updated exhibition image description");
  await selectLocale(edit, "CA");
  await edit.getByLabel("Texto alternativo de imágenes", { exact: true }).fill("Exposició amb text alternatiu actualitzat");
  await edit.getByRole("button", { name: "Guardar noticia", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(card.getByText("Descripción revisada desde el formulario.", { exact: true })).toBeVisible();
  await expect(card.locator(".news-card__zoom-button")).toHaveCount(2);
  await expect(card.getByRole("img", { name: "Exposición con texto alternativo actualizado", exact: true })).toHaveCount(2);
  const revised = backend.state.tables.news_items.find((item) => item.id === row.id)!;
  expect(revised.category).toBe("premio");
  expect(revised.translations.en.description).toBe("Edited English description.");
  expect(revised.translations.en.imageAlt).toBe("Updated exhibition image description");
  expect(revised.translations.ca.imageAlt).toBe("Exposició amb text alternatiu actualitzat");
  expect(backend.state.tables.news_item_images.filter((item) => item.news_item_id === row.id).every((item) => item.image_alt === "Exposición con texto alternativo actualizado")).toBe(true);
  await selectLanguage(page, "English");
  const englishCard = page.locator(".news-card").filter({ has: page.getByRole("heading", { name: "Editorial test news", exact: true }) });
  await expect(englishCard.getByRole("img", { name: "Updated exhibition image description", exact: true })).toHaveCount(2);
  await selectLanguage(page, "Català");
  await expect(card.getByRole("img", { name: "Exposició amb text alternatiu actualitzat", exact: true })).toHaveCount(2);
  await selectLanguage(page, "Español");
  await expect(card.getByRole("img", { name: "Exposición con texto alternativo actualizado", exact: true })).toHaveCount(2);
  await card.getByRole("button", { name: "Eliminar noticia: Noticia de prueba editorial", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Eliminar noticia", exact: true });
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Eliminar noticia: Noticia de prueba editorial", exact: true }).click();
  await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(card).toHaveCount(0);
  expect(backend.state.tables.news_items.some((item) => item.id === row.id)).toBe(false);
  expect(backend.state.tables.news_item_images.some((item) => item.news_item_id === row.id)).toBe(false);
});

test("biography: saves formatted text, multilingual poem and replaces/adds/removes photographs", async ({ page, backend }) => {
  await login(page, backend, "/trayectoria");
  await page.getByRole("button", { name: "Editar texto de trayectoria", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar trayectoria", exact: true });
  await dialog.locator(".rich-text-editor").fill("Trayectoria revisada desde el editor.");
  await dialog.locator(".rich-text-editor").press("ControlOrMeta+A");
  await dialog.getByRole("button", { name: "Cursiva", exact: true }).click();
  await dialog.getByLabel("Poema al final de la trayectoria").fill("Poema de prueba\nPrimera línea\nSegunda línea\n\nMartin March");
  await selectLocale(dialog, "CA");
  await dialog.locator(".rich-text-editor").fill("Trajectòria revisada des de l’editor.");
  await dialog.getByLabel("Poema al final de la trayectoria").fill("Poema català\nPrimera línia\nSegona línia\n\nMartin March");
  await dialog.getByRole("button", { name: "Guardar texto", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".biography-content")).toContainText("Trayectoria revisada desde el editor.");
  await expect(page.locator(".biography-content i, .biography-content em")).toContainText("Trayectoria revisada desde el editor.");
  await expect(page.locator(".biography-poem__body")).toHaveText("Poema de prueba\nPrimera línea\nSegunda línea");
  await expect(page.locator(".biography-poem__author")).toHaveText("Martin March");
  const saved = backend.state.tables.site_pages.find((row) => row.kind === "biography")!;
  expect(saved.translations.ca.poem).toContain("Segona línia");
  await page.locator('.biography-portrait--main input[type="file"]').setInputFiles(image("portada-nueva.png"));
  await expect(page.locator(".biography-portrait--main img")).toHaveAttribute("src", /\/storage\/v1\/object\/public\/biography\/.+portada-nueva/);
  const originalCount = await page.locator(".biography-portrait--secondary").count();
  await page.locator('.biography-portraits input[type="file"]').setInputFiles([image("secundaria-uno.png"), image("secundaria-dos.png")]);
  await expect(page.locator(".biography-portrait--secondary")).toHaveCount(originalCount + 2);
  const photo = page.locator(".biography-portrait--secondary").filter({ has: page.getByRole("img", { name: "secundaria uno", exact: true }) });
  await photo.getByRole("button", { name: "Eliminar imagen", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Eliminar imagen", exact: true });
  await confirmation.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(photo).toBeVisible();
  await photo.getByRole("button", { name: "Eliminar imagen", exact: true }).click();
  await confirmation.getByRole("button", { name: "Eliminar", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.locator(".biography-portrait--secondary")).toHaveCount(originalCount + 1);
  await expect(photo).toHaveCount(0);
});

test("site settings: saves shared contact destinations, handles errors and changes the default language from its flag", async ({ page, backend }) => {
  await login(page, backend);
  await page.getByRole("button", { name: "Configurar web", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Configuración general", exact: true });
  await dialog.getByLabel("Correo destinatario", { exact: true }).fill("artist-test@example.com");
  await dialog.getByLabel("Usuario de Instagram", { exact: true }).fill("artist.test");
  await dialog.getByLabel("Nombre visible de Instagram", { exact: true }).fill("@artist.test");
  await dialog.getByLabel("Teléfono para enlaces (con prefijo)", { exact: true }).fill("34 600 111 222");
  await dialog.getByLabel("Teléfono visible", { exact: true }).fill("+34 600 111 222");
  await dialog.getByLabel("Idioma predeterminado para nuevos visitantes").selectOption("en");
  backend.failNext({ table: "site_settings", method: "POST", status: 500, message: "Configuración no guardada" });
  await dialog.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Correo destinatario", { exact: true })).toHaveValue("artist-test@example.com");
  await dialog.getByRole("button", { name: "Guardar configuración", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.site-footer a[href="mailto:artist-test@example.com"]')).toBeVisible();
  await expect(page.locator('.site-header a[data-social="whatsapp"]')).toHaveAttribute("href", /34600111222/);
  await expect(page.locator('.site-header a[data-social="instagram"]')).toHaveAttribute("href", /artist\.test/);
  expect(backend.state.tables.site_settings.find((row) => row.key === "global")?.value.defaultLanguage).toBe("en");
  await page.goto("/lienzos/horizontes");
  await page.locator(".artwork-interest-button").first().click();
  const contact = page.getByRole("dialog", { name: /^Contactar por la obra:/ });
  await expect(contact.locator(".contact-channel--whatsapp")).toHaveAttribute("href", /34600111222/);
  await expect(contact.locator(".contact-channel--instagram")).toHaveAttribute("href", /artist\.test/);
  await contact.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Edición web", exact: true }).click();
  // The visitor's chosen Spanish persists despite changing the default.
  await expect(page.locator(".header-language__trigger")).toHaveAttribute("aria-label", /Español/);
  await page.locator(".header-language__trigger").click();
  const germanDefault = page.getByRole("menuitem", { name: "Usar Deutsch como idioma predeterminado", exact: true });
  await germanDefault.click();
  await expect(germanDefault).toBeDisabled();
  await expect(page.locator(".header-language__trigger")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("menuitemradio", { name: "Deutsch", exact: true })).toBeFocused();
  await expect.poll(() => backend.state.tables.site_settings.find((row) => row.key === "global")?.value.defaultLanguage).toBe("de");
  await expect(germanDefault).toHaveAttribute("title", "Idioma predeterminado");
  await expect(page.getByRole("menuitemradio", { name: "Deutsch", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Cerrar sesión", exact: true }).click();
  await page.evaluate(() => localStorage.removeItem("toni-crespo-language"));
  await page.reload();
  await expect(page.locator(".header-language__trigger")).toHaveAttribute("aria-label", /Deutsch/);
  await page.locator(".header-language__trigger").click();
  await expect(page.locator(".language-menu__default")).toHaveCount(0);
});
