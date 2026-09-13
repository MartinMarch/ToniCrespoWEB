import type { Locator, Page } from '@playwright/test';
import { test, expect, MOCK_SUPABASE_URL, type MockSupabaseBackend, type MockRow } from '../helpers/mock-supabase';

// All requests stay inside the local HTTP fixture. The real app, Auth client,
// content services and dialogs run unchanged; no production catalog is edited.
const managerPath = '/admin/contenido';
const image = { name: 'obra-cms.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64') };

test.beforeEach(async ({ page, backend }) => {
  backend.enableContentManagerFixture();
  await page.addInitScript(() => localStorage.setItem('toni-crespo-language', 'es'));
});

async function openManager(page: Page, backend: MockSupabaseBackend) {
  await page.goto('/');
  await backend.signIn(page);
  await page.getByRole('button', { name: 'Configurar web', exact: true }).click();
  await page.getByRole('dialog', { name: 'Configuración general', exact: true })
    .getByRole('button', { name: 'Administrar contenido', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/contenido$/);
  await expect(page.getByRole('heading', { name: 'Gestor de contenido', exact: true })).toBeVisible();
  await expect(page.locator('.organizer-pane')).toHaveCount(2);
}

function pane(page: Page, side = 0) { return page.locator('.organizer-pane').nth(side); }
function writes(backend: MockSupabaseBackend) {
  return backend.requests.filter((request) => new URL(request.url).pathname.startsWith('/rest/v1/')
    && !new URL(request.url).pathname.endsWith('/rpc/is_admin') && !['GET', 'HEAD'].includes(request.method));
}
function catalog(backend: MockSupabaseBackend) {
  return structuredClone({ collections: backend.state.tables.collections, artworks: backend.state.tables.artworks });
}
async function titles(container: Locator, expected: string[]) { await expect(container.locator('.organizer-artwork-title')).toHaveText(expected); }
async function move(page: Page, title: string, target: string, index = 0) {
  await page.getByRole('button', { name: `Mover ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Mover ${title}`, exact: true });
  await dialog.getByRole('combobox', { name: 'Colección destino', exact: true }).selectOption(target);
  await dialog.getByRole('combobox', { name: 'Posición', exact: true }).selectOption(String(index));
  await dialog.getByRole('button', { name: 'Aplicar al borrador', exact: true }).click();
  await expect(dialog).toBeHidden();
}
async function saveOrder(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar organización', exact: true });
  await dialog.getByRole('button', { name: 'Guardar organización', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.organizer-success')).toContainText('Organización guardada');
}
async function manageArtwork(page: Page, title: string) {
  await page.getByRole('button', { name: `Gestionar ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Gestionar obra', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function manageCollection(page: Page, title: string) {
  await page.getByRole('button', { name: `Gestionar colección ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Gestionar colección', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function artworkForm(page: Page, title: string) {
  await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^Añadir obra a / });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Técnica', { exact: true }).fill('Óleo sobre lienzo');
  await dialog.getByLabel('Dimensiones', { exact: true }).fill('40 × 40 cm');
  await dialog.getByLabel('Descripción', { exact: true }).fill('Primera línea.\n\nFicha de la nueva obra.');
  await dialog.locator('input[type="file"]').setInputFiles(image);
  return dialog;
}
async function api(page: Page, backend: MockSupabaseBackend, path: string, method: string, body?: unknown, role: 'admin' | 'nonAdmin' | null = 'admin') {
  return page.evaluate(async ({ origin, pathname, verb, payload, credentials }) => {
    let token = 'public-test-anon-key';
    if (credentials) {
      const authentication = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials),
      });
      token = (await authentication.json()).access_token;
    }
    const response = await fetch(`${origin}${pathname}`, { method: verb, headers: {
      'content-type': 'application/json', authorization: `Bearer ${token}`, apikey: 'public-test-anon-key', prefer: 'return=representation',
    }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }, { origin: MOCK_SUPABASE_URL, pathname: path, verb: method, payload: body, credentials: role ? backend[role] : null });
}
function payload(backend: MockSupabaseBackend, next: Record<string, string[]>) {
  return { expected_state: Object.keys(next).map((id) => ({ id, artworks: backend.state.tables.artworks
    .filter((row) => row.collection_id === id).map(({ id: artworkId, sort_order }) => ({ id: artworkId, sort_order })) })),
  next_state: Object.entries(next).map(([id, artwork_ids]) => ({ id, artwork_ids })) };
}

function enableLegacyCatalogFixture(backend: MockSupabaseBackend) {
  const translations = {
    ca: { technique: 'Tècnica mixta', caption: '', description: '' },
    en: { technique: 'Mixed media', caption: '', description: '' },
    de: { technique: 'Mischtechnik', caption: '', description: '' },
  };
  for (const collection of backend.state.tables.collections) {
    if (!collection.is_recent) collection.source = 'legacy-wordpress';
  }
  for (const artwork of backend.state.tables.artworks) {
    Object.assign(artwork, { technique: 'Técnica mixta', caption: '', description: '', translations: structuredClone(translations) });
  }
  for (const kind of ['canvas', 'paper']) {
    const source = backend.state.tables.collections.find((row) => row.support_kind === kind && !row.is_recent)!;
    backend.state.tables.collections.push({ ...structuredClone(source), id: `legacy-hidden-${kind}`, slug: `archivo-oculto-${kind}`, title: `Archivo oculto ${kind}`, is_published: false });
    const artwork = backend.state.tables.artworks.find((row) => row.collection_id === source.id)!;
    backend.state.tables.artworks.push({ ...structuredClone(artwork), id: `legacy-private-${kind}`, slug: `privada-${kind}`, collection_id: `legacy-hidden-${kind}`, title: `Obra privada ${kind}` });
  }
}

function enableReviewFixture(backend: MockSupabaseBackend) {
  for (const artwork of backend.state.tables.artworks) {
    Object.assign(artwork, { description: '', caption: '', translations: {} });
  }
  Object.assign(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!, {
    title: '   ', technique: '', dimensions: '', is_available: false,
  });
  Object.assign(backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!, {
    image_url: '', source_image_url: '', thumbnail_url: null,
  });
}

test('all published legacy collections and their works appear in both public branches in every language without a technique keyword', async ({ page, backend }) => {
  enableLegacyCatalogFixture(backend);
  const original = catalog(backend);
  for (const language of ['Español', 'Català', 'English', 'Deutsch']) {
    for (const branch of [{ path: '/lienzos', kind: 'canvas', id: 'collection-canvas', artworks: ['mar-sereno', 'horizonte-abierto'] }, { path: '/laminas', kind: 'paper', id: 'collection-paper', artworks: ['memoria-del-papel'] }]) {
      await page.goto(branch.path);
      await page.locator('.header-language__trigger').click();
      await page.getByRole('menuitemradio', { name: new RegExp(`^${language}`) }).click();
      await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(new RegExp(language));
      const published = backend.state.tables.collections.filter((row) => row.support_kind === branch.kind && row.is_published);
      const links = page.locator('.support-collection-preview-card__link');
      await expect(links).toHaveCount(published.length);
      expect((await links.evaluateAll((items) => items.map((item) => item.getAttribute('href')))).sort())
        .toEqual(published.map((row) => `${branch.path}/${row.slug}`).sort());
      const collection = backend.state.tables.collections.find((row) => row.id === branch.id)!;
      const preview = page.locator(`.support-collection-preview-card__link[href="${branch.path}/${collection.slug}"]`);
      await expect(preview.locator('.support-collection-preview-card__artwork')).toHaveCount(branch.artworks.length);
      await preview.click();
      for (const slug of branch.artworks) await expect(page.locator(`#${slug}`)).toBeVisible();
      await expect(page.locator('#obra-reservada')).toHaveCount(0);
      await expect(page.locator('.content-review-details, .content-review-notice, .content-review-badge')).toHaveCount(0);
    }
  }
  await page.goto('/lienzos/archivo-oculto-canvas');
  await expect(page.getByRole('heading', { name: 'Obra privada canvas', exact: true })).toHaveCount(0);
  expect(catalog(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
});

test('editorial review warns per incomplete work with explicit reasons and leaves empty collections and optional text alone', async ({ page, backend }) => {
  enableReviewFixture(backend);
  const original = catalog(backend);
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const collectionShortcut = page.locator('.organizer-collection-item[data-drop-collection-id="collection-canvas"]');
  await expect(collectionShortcut).toContainText('2 obras por revisar');
  await expect(pane(page)).toContainText('2 obras por revisar');
  const incomplete = page.locator('[data-artwork-id="artwork-square"]');
  const missingImage = page.locator('[data-artwork-id="artwork-wide"]');
  const complete = page.locator('[data-artwork-id="artwork-hidden"]');
  const toggle = incomplete.locator('summary').filter({ hasText: 'Revisar ficha' });
  await expect(incomplete.locator('.content-review-details')).toHaveCSS('background-color', 'rgb(255, 246, 235)');
  await expect(toggle.locator('svg').first()).toHaveCSS('color', 'rgb(180, 83, 9)');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(incomplete.getByText('Falta el título.', { exact: true })).toBeVisible();
  await expect(incomplete.getByText('Faltan las medidas.', { exact: true })).toBeVisible();
  await expect(incomplete.getByText('Falta la técnica.', { exact: true })).toBeVisible();
  await expect(incomplete.getByText('Falta la imagen.', { exact: true })).toHaveCount(0);
  await missingImage.locator('summary').filter({ hasText: 'Revisar ficha' }).click();
  await expect(missingImage.getByText('Falta la imagen.', { exact: true })).toBeVisible();
  await expect(complete.getByText('Revisar ficha', { exact: true })).toHaveCount(0);
  await incomplete.locator('.content-manager-card-menu').click();
  const management = page.getByRole('dialog', { name: 'Gestionar obra', exact: true });
  for (const reason of ['Falta el título.', 'Faltan las medidas.', 'Falta la técnica.']) {
    await expect(management.getByText(reason, { exact: true })).toBeVisible();
  }
  await expect(management.getByRole('button', { name: 'Editar ficha', exact: true })).toBeEnabled();
  await page.keyboard.press('Escape');
  const collectionManagement = await manageCollection(page, 'Horizontes');
  const reviewList = collectionManagement.getByRole('region', { name: 'Obras de la colección por revisar', exact: true });
  await expect(reviewList).toContainText('2 obras por revisar');
  await expect(reviewList.getByRole('button')).toHaveCount(2);
  await expect(reviewList.getByRole('button', { name: 'Editar ficha: Sin título', exact: true })).toContainText('Faltan las medidas.');
  await expect(reviewList.getByRole('button', { name: 'Editar ficha: Horizonte abierto', exact: true })).toContainText('Falta la imagen.');
  await page.keyboard.press('Escape');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(toggle).toBeVisible();
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
  await expect(page.locator('.organizer-collection-item[data-drop-collection-id="collection-empty"]')).not.toContainText('por revisar');
  await expect(page.locator('.organizer-collection-item[data-drop-collection-id="collection-recent-canvas"]')).not.toContainText('por revisar');
  await page.getByRole('button', { name: 'Obra en papel', exact: true }).click();
  await pane(page).getByRole('combobox').selectOption('collection-paper');
  await expect(page.getByText('Revisar ficha', { exact: true })).toHaveCount(0);
  await expect(page.locator('.organizer-collection-item .content-review-badge')).toHaveCount(0);
  expect(catalog(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
});

test('review filtering and collection warning counts follow unsaved movements and undo without writing or hiding the works', async ({ page, backend }) => {
  enableReviewFixture(backend);
  const original = catalog(backend);
  await openManager(page, backend);
  const collectionBadge = (id: string) => page.locator(`.organizer-collection-item[data-drop-collection-id="${id}"] .content-review-badge`);
  await page.getByRole('combobox', { name: 'Filtrar obras', exact: true }).selectOption('review');
  const results = page.getByRole('region', { name: 'Resultados en toda la rama', exact: true });
  await expect(results.getByRole('button')).toHaveCount(2);
  await expect(results.locator('.content-review-badge')).toHaveText(['Revisar ficha', 'Revisar ficha']);
  await results.getByRole('button').filter({ hasText: 'Sin título' }).click();
  await titles(pane(page), ['Sin título', 'Horizonte abierto']);
  await move(page, 'Sin título', 'collection-recent-canvas');
  await expect(collectionBadge('collection-canvas')).toHaveText('1 obra por revisar');
  await expect(collectionBadge('collection-recent-canvas')).toHaveText('1 obra por revisar');
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(collectionBadge('collection-canvas')).toHaveText('2 obras por revisar');
  await expect(collectionBadge('collection-recent-canvas')).toHaveCount(0);
  expect(catalog(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
});

test('correcting the required artwork fields clears review warnings after save and reload without adding optional text or changing availability', async ({ page, backend }) => {
  const originalImage = backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!.image_url;
  enableReviewFixture(backend);
  Object.assign(backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!, { image_url: originalImage, source_image_url: originalImage });
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const card = page.locator('[data-artwork-id="artwork-square"]');
  await expect(pane(page)).toContainText('1 obra por revisar');
  await card.locator('.content-manager-card-menu').click();
  await page.getByRole('dialog', { name: 'Gestionar obra', exact: true }).getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^Editar obra de / });
  await form.getByLabel('Título', { exact: true }).fill('Mar en silencio');
  await form.getByLabel('Dimensiones', { exact: true }).fill('50 × 60 cm');
  await form.getByLabel('Técnica', { exact: true }).fill('Óleo');
  await expect(form.getByRole('textbox', { name: /^Descripción/ })).toHaveValue('');
  backend.failNext({ table: 'artworks', method: 'PATCH', message: 'Guardado interrumpido, conserva la ficha' });
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Guardado interrumpido');
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Mar en silencio');
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!.title.trim()).toBe('');
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(card.getByRole('heading', { name: 'Mar en silencio', exact: true })).toBeVisible();
  await expect(card.getByText('Revisar ficha', { exact: true })).toHaveCount(0);
  await expect(page.locator('.organizer-collection-item[data-drop-collection-id="collection-canvas"]')).not.toContainText('por revisar');
  const stored = backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!;
  expect(stored).toMatchObject({ title: 'Mar en silencio', dimensions: '50 × 60 cm', technique: 'Óleo', description: '', is_available: false, is_published: true });
  await page.reload();
  await page.getByRole('button', { name: 'Activar modo edición', exact: true }).click();
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await expect(card.getByRole('heading', { name: 'Mar en silencio', exact: true })).toBeVisible();
  await expect(card.getByText('Revisar ficha', { exact: true })).toHaveCount(0);
  await expect(card.locator('.content-manager-badges')).toHaveText('No disponible');
  expect(backend.state.tables.artworks).toHaveLength(4);
  expect(backend.state.uploads).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('editing can repair a missing image without deleting shared files and later edits without a file preserve every image field', async ({ page, backend }) => {
  const original = structuredClone(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!);
  Object.assign(backend.state.tables.artworks.find((row) => row.id === original.id)!, { image_url: '', thumbnail_url: null });
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const card = page.locator('[data-artwork-id="artwork-square"]');
  await expect(card.getByText('Revisar ficha', { exact: true })).toBeVisible();
  const management = await manageArtwork(page, 'Mar sereno');
  await expect(management.getByText('Falta la imagen.', { exact: true })).toBeVisible();
  await management.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^Editar obra de / });
  await form.getByLabel('Imagen de la obra', { exact: true }).setInputFiles(image);
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(backend.state.uploads).toEqual([]);
  expect(writes(backend)).toEqual([]);
  const retryManagement = await manageArtwork(page, 'Mar sereno');
  await retryManagement.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  await form.getByLabel('Imagen de la obra', { exact: true }).setInputFiles(image);
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(card.getByText('Revisar ficha', { exact: true })).toHaveCount(0);
  const saved = structuredClone(backend.state.tables.artworks.find((row) => row.id === original.id)!);
  expect(saved.image_url).not.toBe(original.image_url);
  expect(saved.image_url).toContain(`${MOCK_SUPABASE_URL}/storage/v1/object/public/artworks/`);
  expect(saved).toMatchObject({ thumbnail_url: saved.image_url, source_image_url: original.source_image_url, width: 1, height: 1, dimensions: original.dimensions, title: original.title });
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.storage[new URL(original.image_url).pathname.replace('/storage/v1/object/public/', '')]).toBeDefined();
  expect(backend.state.deletedAssets).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: 'Activar modo edición', exact: true }).click();
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await expect(card.locator('.organizer-thumbnail img')).toHaveAttribute('src', saved.image_url);
  await expect(card.getByText('Revisar ficha', { exact: true })).toHaveCount(0);
  const editAgain = await manageArtwork(page, 'Mar sereno');
  await editAgain.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  await form.getByRole('textbox', { name: /^Descripción/ }).fill('Una descripción revisada sin sustituir la imagen.');
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form).toBeHidden();
  const withoutFile = backend.state.tables.artworks.find((row) => row.id === original.id)!;
  for (const field of ['image_url', 'thumbnail_url', 'source_image_url', 'width', 'height', 'dimensions']) expect(withoutFile[field]).toEqual(saved[field]);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto('/lienzos/horizontes');
  await expect(page.locator('#mar-sereno img').first()).toHaveAttribute('src', saved.image_url);
});

test('a replacement image followed by an uncertain artwork write preserves old and uploaded files while retaining the editor for retry', async ({ page, backend }) => {
  const original = structuredClone(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!);
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const management = await manageArtwork(page, 'Mar sereno');
  await management.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^Editar obra de / });
  await form.getByLabel('Imagen de la obra', { exact: true }).setInputFiles(image);
  backend.failNext({ table: 'artworks', method: 'PATCH', status: 500, message: 'Respuesta de guardado incierta' });
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('Respuesta de guardado incierta');
  expect(backend.state.tables.artworks.find((row) => row.id === original.id)).toEqual(original);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.storage[backend.state.uploads[0]]).toBeDefined();
  expect(backend.state.deletedAssets).toEqual([]);
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form).toBeHidden();
  expect(backend.state.tables.artworks.find((row) => row.id === original.id)!.image_url).not.toBe(original.image_url);
  expect(backend.state.tables.artworks.find((row) => row.id === original.id)!.source_image_url).toBe(original.source_image_url);
  expect(backend.state.tables.artworks).toHaveLength(4);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('a confirmed replacement followed by a catalog read failure keeps its uploaded image and reloads without a second update', async ({ page, backend }) => {
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const management = await manageArtwork(page, 'Mar sereno');
  await management.getByRole('button', { name: 'Editar ficha', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^Editar obra de / });
  await form.getByLabel('Imagen de la obra', { exact: true }).setInputFiles(image);
  backend.failNext({ table: 'collections', method: 'GET', message: 'Catálogo temporalmente inaccesible' });
  await form.getByRole('button', { name: 'Guardar obra', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('El contenido se ha guardado, pero no se ha podido recargar');
  const saved = structuredClone(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.storage[backend.state.uploads[0]]).toBeDefined();
  expect(backend.state.deletedAssets).toEqual([]);
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await expect(page.locator('[data-artwork-id="artwork-square"] .organizer-thumbnail img')).toHaveAttribute('src', saved.image_url);
  expect(backend.requests.filter((request) => new URL(request.url).pathname === '/rest/v1/artworks' && request.method === 'PATCH')).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('legacy organizer URL remains compatible with the protected canonical content manager route', async ({ page, backend }) => {
  await page.goto('/admin/organizar-obras');
  await expect(page).toHaveURL(/\/admin\/(contenido|organizar-obras)$/);
  await expect(page.locator('.organizer-access')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nueva obra', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
  const login = page.getByRole('dialog', { name: 'Inicio de sesión de edición', exact: true });
  await login.getByLabel('Email admin').fill(backend.admin.email);
  await login.getByLabel('Contraseña', { exact: true }).fill(backend.admin.password);
  await login.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
  await expect(login).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Gestor de contenido', exact: true })).toBeVisible();
  await expect(page.locator('.organizer-pane')).toHaveCount(2);
  expect(writes(backend)).toEqual([]);
});

test('branches isolate collection options, search and move destinations, with one recent collection pinned first', async ({ page, backend }) => {
  await openManager(page, backend);
  for (const branch of [
    { label: 'Lienzos', kind: 'canvas', ids: ['collection-recent-canvas', 'collection-canvas', 'collection-empty'], other: 'Memoria del papel' },
    { label: 'Obra en papel', kind: 'paper', ids: ['collection-recent-paper', 'collection-paper'], other: 'Mar sereno' },
  ]) {
    await page.getByRole('button', { name: branch.label, exact: true }).click();
    await expect(page.getByRole('button', { name: branch.label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    for (const select of [pane(page).getByRole('combobox'), pane(page, 1).getByRole('combobox')]) {
      expect(await select.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(branch.ids);
    }
    const shortcuts = page.locator('.organizer-collection-item');
    expect(await shortcuts.evaluateAll((items) => items.map((item) => item.getAttribute('data-drop-collection-id')))).toEqual(branch.ids);
    await page.getByRole('searchbox').fill(branch.other);
    await expect(page.locator('.organizer-artwork')).toHaveCount(0);
    await page.getByRole('searchbox').fill('');
    const existing = branch.kind === 'canvas' ? 'collection-canvas' : 'collection-paper';
    await pane(page).getByRole('combobox').selectOption(existing);
    const artworkTitle = branch.kind === 'canvas' ? 'Mar sereno' : 'Memoria del papel';
    await page.getByRole('button', { name: `Mover ${artworkTitle}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: `Mover ${artworkTitle}`, exact: true });
    expect(await dialog.getByRole('combobox', { name: 'Colección destino', exact: true }).locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))).toEqual(branch.ids);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  }
  expect(writes(backend)).toEqual([]);
});

test('switching branches preserves independent drafts and one save never moves an artwork across supports', async ({ page, backend }) => {
  const original = catalog(backend);
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await pane(page, 1).getByRole('combobox').selectOption('collection-empty');
  await move(page, 'Mar sereno', 'collection-empty');
  await page.getByRole('button', { name: 'Obra en papel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await pane(page).getByRole('combobox').selectOption('collection-paper');
  await move(page, 'Memoria del papel', 'collection-recent-paper');
  await page.getByRole('button', { name: 'Lienzos', exact: true }).click();
  await pane(page).getByRole('combobox').selectOption('collection-empty');
  await titles(pane(page), ['Mar sereno']);
  expect(catalog(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
  await saveOrder(page);
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!.collection_id).toBe('collection-empty');
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-paper')!.collection_id).toBe('collection-recent-paper');
  for (const row of backend.state.tables.artworks) {
    const before = original.artworks.find((item) => item.id === row.id)!;
    expect(backend.state.tables.collections.find((collection) => collection.id === row.collection_id)!.support_kind)
      .toBe(original.collections.find((collection) => collection.id === before.collection_id)!.support_kind);
  }
});

test('recent collections remain first in each public branch, can be hidden without deleting works and only their description is editable', async ({ page, backend }) => {
  for (const path of ['/lienzos', '/laminas']) {
    await page.goto(path);
    await expect(page.locator('.support-collection-preview-card__title').first()).toHaveText('Obras recientes');
  }
  await openManager(page, backend);
  const original = structuredClone(backend.state.tables.collections.find((row) => row.id === 'collection-recent-canvas')!);
  let management = await manageCollection(page, 'Obras recientes');
  await expect(management.getByRole('button', { name: /Eliminar/ })).toHaveCount(0);
  await expect(management.getByRole('button', { name: 'Editar colección', exact: true })).toHaveCount(0);
  await management.getByRole('button', { name: 'Editar descripción', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Editar descripción de Obras recientes', exact: true });
  await expect(editor.getByRole('textbox', { name: 'Nombre', exact: true })).toBeDisabled();
  await editor.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Las últimas obras del taller.');
  await editor.getByRole('button', { name: 'Guardar colección', exact: true }).click();
  await expect(editor).toBeHidden();
  const stored = backend.state.tables.collections.find((row) => row.id === original.id)!;
  expect(stored.title).toBe(original.title);
  expect(stored.slug).toBe(original.slug);
  expect(stored.is_recent).toBe(true);
  expect(stored.description).toBe('Las últimas obras del taller.');
  for (const locale of Object.keys(original.translations)) expect(stored.translations[locale].title).toBe(original.translations[locale].title);
  management = await manageCollection(page, 'Obras recientes');
  await management.getByRole('button', { name: 'Ocultar colección', exact: true }).click();
  await expect(management).toBeHidden();
  await expect(pane(page)).toContainText('Colección oculta al público');
  management = await manageCollection(page, 'Obras recientes');
  await management.getByRole('button', { name: 'Mostrar colección', exact: true }).click();
  await expect(management).toBeHidden();
  expect(backend.state.tables.collections.find((row) => row.id === original.id)!.is_published).toBe(true);
  management = await manageCollection(page, 'Obras recientes');
  await management.getByRole('button', { name: 'Ocultar colección', exact: true }).click();
  await expect(management).toBeHidden();
  expect(backend.state.tables.collections.filter((row) => row.support_kind === 'canvas' && row.is_recent)).toHaveLength(1);
  expect(backend.state.tables.artworks).toHaveLength(4);
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto('/lienzos');
  await expect(page.locator('.support-collection-preview-card__title').filter({ hasText: /^Obras recientes$/ })).toHaveCount(0);
  await page.goto('/laminas');
  await expect(page.locator('.support-collection-preview-card__title').first()).toHaveText('Obras recientes');
  expect(backend.state.deletedAssets).toEqual([]);
});

for (const branch of [{ label: 'Lienzos', kind: 'canvas' }, { label: 'Obra en papel', kind: 'paper' }] as const) {
  test(`${branch.kind}: creates a work in recent by default, edits availability/visibility independently and deletes only after confirmation`, async ({ page, backend }) => {
    await openManager(page, backend);
    await page.getByRole('button', { name: branch.label, exact: true }).click();
    const title = `Obra CMS ${branch.kind}`;
    const form = await artworkForm(page, title);
    await expect(form.getByRole('combobox', { name: 'Colección', exact: true })).toHaveValue(`collection-recent-${branch.kind}`);
    const optionIds = await form.getByRole('combobox', { name: 'Colección', exact: true }).locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    expect(optionIds.every((id) => backend.state.tables.collections.find((row) => row.id === id)!.support_kind === branch.kind)).toBe(true);
    await expect(form.getByRole('checkbox', { name: 'Disponible', exact: true })).toBeChecked();
    await expect(form.getByRole('checkbox', { name: 'Visible al público', exact: true })).toBeChecked();
    await form.getByRole('checkbox', { name: 'Disponible', exact: true }).uncheck();
    await form.getByRole('button', { name: 'Añadir obra', exact: true }).click();
    await expect(form).toBeHidden();
    const row = backend.state.tables.artworks.find((item) => item.title === title)!;
    expect(row.collection_id).toBe(`collection-recent-${branch.kind}`);
    expect(row.is_available).toBe(false);
    expect(row.is_published).toBe(true);
    const createdId = row.id;
    let management = await manageArtwork(page, title);
    await expect(management.locator('.content-manager-badges')).toContainText('No disponible');
    await management.getByRole('button', { name: 'Editar ficha', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /^Editar obra de / });
    await expect(editor.getByRole('checkbox', { name: 'Disponible', exact: true })).not.toBeChecked();
    await editor.getByRole('checkbox', { name: 'Disponible', exact: true }).check();
    await editor.getByRole('checkbox', { name: 'Visible al público', exact: true }).uncheck();
    await editor.getByRole('textbox', { name: /^Descripción/ }).fill('Texto editado.\n\nObra oculta en el gestor.');
    await editor.getByRole('button', { name: 'Guardar obra', exact: true }).click();
    await expect(editor).toBeHidden();
    const edited = backend.state.tables.artworks.find((item) => item.id === createdId)!;
    expect(edited.is_available).toBe(true);
    expect(edited.is_published).toBe(false);
    expect(edited.description).toBe('Texto editado.\n\nObra oculta en el gestor.');
    management = await manageArtwork(page, title);
    await management.getByRole('button', { name: 'Eliminar obra', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: 'Eliminar obra', exact: true });
    await deletion.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(backend.state.tables.artworks.some((item) => item.id === createdId)).toBe(true);
    management = await manageArtwork(page, title);
    await management.getByRole('button', { name: 'Eliminar obra', exact: true }).click();
    await deletion.getByRole('button', { name: 'Eliminar definitivamente', exact: true }).click();
    await expect(deletion).toBeHidden();
    expect(backend.state.tables.artworks.some((item) => item.id === createdId)).toBe(false);
    expect(backend.state.tables.collections.find((item) => item.id === row.collection_id)!.cover_image_url).toBeNull();
    expect(backend.state.deletedAssets).toEqual([]);
    expect(backend.requests.some((request) => request.method === 'POST' && new URL(request.url).pathname === '/rest/v1/rpc/delete_artwork_with_cover_refresh')).toBe(true);
    expect(backend.state.tables.artworks).toHaveLength(4);
  });
}

test('visible unavailable works keep their public badge and a neutral contact draft while legacy availability remains available', async ({ page, backend }) => {
  backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!.is_available = false;
  await page.goto('/lienzos/horizontes');
  const available = page.locator('#mar-sereno');
  const unavailable = page.locator('#horizonte-abierto');
  await expect(available.getByRole('heading', { name: 'Mar sereno', exact: true })).toBeVisible();
  await expect(available.locator('.artwork-availability')).toHaveCount(0);
  await expect(unavailable.locator('.artwork-availability')).toHaveText('No disponible');
  await expect(page.getByRole('heading', { name: 'Obra reservada', exact: true })).toHaveCount(0);
  await unavailable.getByRole('button', { name: 'Consultar sobre esta obra', exact: true }).click();
  const contact = page.getByRole('dialog', { name: 'Contactar por la obra: Horizonte abierto', exact: true });
  await expect(contact).toContainText('Esta obra no está disponible');
  const email = new URL((await contact.getByRole('link', { name: 'Correo', exact: true }).getAttribute('href'))!);
  expect(email.searchParams.get('subject')).toBe('Consulta sobre la obra: Horizonte abierto');
  expect(email.searchParams.get('body')).toContain('He visto que no está disponible');
  expect(email.searchParams.get('body')).not.toContain('me interesa esta obra');
  const whatsapp = new URL((await contact.getByRole('link', { name: 'WhatsApp', exact: true }).getAttribute('href'))!);
  expect(whatsapp.searchParams.get('text')).toContain('quisiera consultar sobre esta obra');
  await page.keyboard.press('Escape');
  backend.state.tables.collections.find((row) => row.id === 'collection-canvas')!.is_published = false;
  await page.goto('/lienzos/horizontes');
  await expect(page.getByRole('heading', { name: 'Horizonte abierto', exact: true })).toHaveCount(0);
  const publicArtworks = await api(page, backend, '/rest/v1/artworks', 'GET', undefined, null);
  expect(publicArtworks.body.map((row: MockRow) => row.id)).toEqual(['artwork-paper']);
  expect(writes(backend)).toEqual([]);
});

test('availability and visibility quick actions preserve metadata, report failures and drive independent filters', async ({ page, backend }) => {
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const original = structuredClone(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!);
  let management = await manageArtwork(page, 'Mar sereno');
  backend.failNext({ table: 'artworks', method: 'PATCH', message: 'Fallo de disponibilidad simulado' });
  await management.getByRole('button', { name: 'Marcar como no disponible', exact: true }).click();
  await expect(management.getByRole('alert')).toContainText('Fallo de disponibilidad simulado');
  expect(backend.state.tables.artworks.find((row) => row.id === original.id)).toEqual(original);
  await management.getByRole('button', { name: 'Marcar como no disponible', exact: true }).click();
  await expect(management).toBeHidden();
  await page.getByRole('combobox', { name: 'Filtrar obras', exact: true }).selectOption('unavailable');
  await titles(pane(page), ['Mar sereno']);
  management = await manageArtwork(page, 'Mar sereno');
  await management.getByRole('button', { name: 'Ocultar obra', exact: true }).click();
  await expect(management).toBeHidden();
  await page.getByRole('combobox', { name: 'Filtrar obras', exact: true }).selectOption('hidden');
  await titles(pane(page), ['Mar sereno', 'Obra reservada']);
  const hidden = backend.state.tables.artworks.find((row) => row.id === original.id)!;
  expect(hidden.is_available).toBe(false);
  expect(hidden.is_published).toBe(false);
  expect(hidden.title).toBe(original.title);
  expect(hidden.description).toBe(original.description);
  expect(hidden.image_url).toBe(original.image_url);
  management = await manageArtwork(page, 'Mar sereno');
  await management.getByRole('button', { name: 'Mostrar obra', exact: true }).click();
  await expect(management).toBeHidden();
  await page.getByRole('combobox', { name: 'Filtrar obras', exact: true }).selectOption('unavailable');
  await titles(pane(page), ['Mar sereno']);
  management = await manageArtwork(page, 'Mar sereno');
  await management.getByRole('button', { name: 'Marcar como disponible', exact: true }).click();
  await expect(management).toBeHidden();
  await titles(pane(page), []);
  expect(backend.state.tables.artworks.find((row) => row.id === original.id)!.is_available).toBe(true);
  expect(backend.state.tables.artworks.find((row) => row.id === original.id)!.is_published).toBe(true);
});

test('availability saved in the manager survives reload and logout, stays publicly visible and can be restored independently', async ({ page, backend }) => {
  const original = structuredClone(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!);
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const management = await manageArtwork(page, 'Mar sereno');
  await management.getByRole('button', { name: 'Marcar como no disponible', exact: true }).click();
  await expect(management).toBeHidden();
  await page.reload();
  await page.getByRole('button', { name: 'Activar modo edición', exact: true }).click();
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await expect(page.locator('[data-artwork-id="artwork-square"] .content-manager-badges')).toHaveText('No disponible');
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto('/lienzos/horizontes');
  const publicArtwork = page.locator('#mar-sereno');
  await expect(publicArtwork.locator('.artwork-availability')).toHaveText('No disponible');
  await page.reload();
  await expect(publicArtwork.getByRole('heading', { name: 'Mar sereno', exact: true })).toBeVisible();
  await expect(publicArtwork.locator('.artwork-availability')).toHaveText('No disponible');
  await expect(publicArtwork.getByRole('button', { name: 'Consultar sobre esta obra', exact: true })).toBeVisible();
  const stored = backend.state.tables.artworks.find((row) => row.id === original.id)!;
  expect(stored).toMatchObject({ is_available: false, is_published: true, collection_id: original.collection_id, title: original.title, image_url: original.image_url });
  expect(writes(backend)).toHaveLength(1);
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const restore = await manageArtwork(page, 'Mar sereno');
  await restore.getByRole('button', { name: 'Marcar como disponible', exact: true }).click();
  await expect(restore).toBeHidden();
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto('/lienzos/horizontes');
  await expect(publicArtwork.getByRole('heading', { name: 'Mar sereno', exact: true })).toBeVisible();
  await expect(publicArtwork.locator('.artwork-availability')).toHaveCount(0);
  expect(writes(backend)).toHaveLength(2);
  expect(backend.state.tables.artworks).toHaveLength(4);
});

test('new collections stay in their active branch and only ordinary empty collections can be renamed or deleted', async ({ page, backend }) => {
  await openManager(page, backend);
  for (const branch of [{ label: 'Lienzos', kind: 'canvas' }, { label: 'Obra en papel', kind: 'paper' }]) {
    await page.getByRole('button', { name: branch.label, exact: true }).click();
    await page.getByRole('button', { name: 'Nueva colección', exact: true }).click();
    const form = page.getByRole('dialog', { name: /^Nueva colección de / });
    const title = `Nueva colección ${branch.kind}`;
    await form.getByRole('textbox', { name: 'Nombre', exact: true }).fill(title);
    await form.getByRole('textbox', { name: 'Descripción', exact: true }).fill('Descripción de la colección.');
    await form.getByRole('button', { name: 'Crear colección', exact: true }).click();
    await expect(form).toBeHidden();
    const row = backend.state.tables.collections.find((item) => item.title === title)!;
    expect(row.support_kind).toBe(branch.kind);
    expect(row.is_recent).toBe(false);
    await expect(pane(page).getByRole('combobox').locator('option').first()).toHaveValue(`collection-recent-${branch.kind}`);
    await pane(page).getByRole('combobox').selectOption(row.id);
    let management = await manageCollection(page, title);
    await management.getByRole('button', { name: 'Editar colección', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /^Editar colección de / });
    await expect(editor.getByRole('textbox', { name: 'Nombre', exact: true })).toBeEnabled();
    await editor.getByRole('textbox', { name: 'Nombre', exact: true }).fill(`${title} editada`);
    await editor.getByRole('button', { name: 'Guardar colección', exact: true }).click();
    await expect(editor).toBeHidden();
    management = await manageCollection(page, `${title} editada`);
    await management.getByRole('button', { name: 'Eliminar colección vacía', exact: true }).click();
    const deletion = page.getByRole('dialog', { name: 'Eliminar colección vacía', exact: true });
    await deletion.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(backend.state.tables.collections.some((item) => item.id === row.id)).toBe(true);
    management = await manageCollection(page, `${title} editada`);
    await management.getByRole('button', { name: 'Eliminar colección vacía', exact: true }).click();
    await deletion.getByRole('button', { name: 'Eliminar colección', exact: true }).click();
    await expect(deletion).toBeHidden();
    expect(backend.state.tables.collections.some((item) => item.id === row.id)).toBe(false);
    await expect(page.locator('.organizer-pane')).toHaveCount(2);
  }
  await page.getByRole('button', { name: 'Lienzos', exact: true }).click();
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  const populated = await manageCollection(page, 'Horizontes');
  await expect(populated.getByRole('button', { name: 'Eliminar colección vacía', exact: true })).toBeDisabled();
  expect(backend.state.tables.artworks).toHaveLength(4);
  expect(backend.state.tables.collections.filter((row) => row.is_recent)).toHaveLength(2);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('a work added concurrently prevents empty-collection deletion without cascading into its new content', async ({ page, backend }) => {
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-empty');
  const management = await manageCollection(page, 'Colección vacía');
  await management.getByRole('button', { name: 'Eliminar colección vacía', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: 'Eliminar colección vacía', exact: true });
  backend.state.tables.artworks.push({ ...structuredClone(backend.state.tables.artworks[0]), id: 'artwork-concurrent', collection_id: 'collection-empty', title: 'Obra añadida mientras editabas' });
  const concurrent = catalog(backend);
  await deletion.getByRole('button', { name: 'Eliminar colección', exact: true }).click();
  await expect(deletion.getByRole('alert')).toContainText(/colección.*obras|colección.*vacía/i);
  expect(catalog(backend)).toEqual(concurrent);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('opening editorial actions with a pending order offers cancel, discard or save before continuing', async ({ page, backend }) => {
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await pane(page, 1).getByRole('combobox').selectOption('collection-empty');
  await move(page, 'Mar sereno', 'collection-empty');
  await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Orden pendiente de guardar', exact: true });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await guard.getByRole('button', { name: 'Seguir organizando', exact: true }).click();
  await titles(pane(page, 1), ['Mar sereno']);
  expect(writes(backend)).toEqual([]);
  await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
  await guard.getByRole('button', { name: 'Descartar orden y continuar', exact: true }).click();
  const form = page.getByRole('dialog', { name: /^Añadir obra a / });
  await expect(form).toBeVisible();
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await titles(pane(page), ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
  await move(page, 'Mar sereno', 'collection-empty');
  await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
  await guard.getByRole('button', { name: 'Guardar y continuar', exact: true }).click();
  await expect(form).toBeVisible();
  expect(writes(backend)).toHaveLength(1);
  expect(new URL(writes(backend)[0].url).pathname).toBe('/rest/v1/rpc/reorganize_artworks');
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!.collection_id).toBe('collection-empty');
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('a committed artwork whose catalog refresh fails is not inserted twice or cleaned up as an orphan', async ({ page, backend }) => {
  await openManager(page, backend);
  const form = await artworkForm(page, 'Obra guardada una sola vez');
  let failed = false;
  await page.route((url) => url.origin === MOCK_SUPABASE_URL && url.pathname === '/rest/v1/collections' && (url.searchParams.get('select') ?? '').includes('artworks('), async (route) => {
    if (!failed && route.request().method() === 'GET') {
      failed = true;
      await route.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'TEST_FAILURE', message: 'No se pudo recargar el catálogo' }) });
    } else await route.fallback();
  });
  await form.getByRole('button', { name: 'Añadir obra', exact: true }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('El contenido se ha guardado, pero no se ha podido recargar');
  await expect(page.getByRole('button', { name: 'Nueva obra', exact: true })).toBeDisabled();
  const saved = backend.state.tables.artworks.filter((row) => row.title === 'Obra guardada una sola vez');
  expect(saved).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
  expect(backend.state.uploads).toHaveLength(1);
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gestionar Obra guardada una sola vez', exact: true })).toBeVisible();
  expect(backend.requests.filter((request) => new URL(request.url).pathname === '/rest/v1/artworks' && request.method === 'POST')).toHaveLength(1);
  expect(backend.state.tables.artworks.filter((row) => row.title === 'Obra guardada una sola vez')).toHaveLength(1);
});

test('saving an order before editorial work stops at a failed catalog refresh and recovers without repeating the save', async ({ page, backend }) => {
  await openManager(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await move(page, 'Mar sereno', 'collection-empty');
  await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Orden pendiente de guardar', exact: true });
  backend.failNext({ table: 'collections', method: 'GET', message: 'Lectura posterior al guardado interrumpida' });
  await guard.getByRole('button', { name: 'Guardar y continuar', exact: true }).click();
  await expect(guard).toBeHidden();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('La organización se ha guardado, pero no se ha podido recargar');
  await expect(page.getByRole('button', { name: 'Nueva obra', exact: true })).toBeDisabled();
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!.collection_id).toBe('collection-empty');
  expect(writes(backend)).toHaveLength(1);
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nueva obra', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /^Añadir obra a / })).toBeVisible();
  expect(writes(backend)).toHaveLength(1);
});

test('browser Back from an artwork editor uses one leave dialog and cancel preserves fields, flags and the selected image', async ({ page, backend }) => {
  await openManager(page, backend);
  const form = await artworkForm(page, 'Borrador que no debe perderse');
  await form.getByRole('checkbox', { name: 'Disponible', exact: true }).uncheck();
  await page.evaluate(() => window.history.back());
  const guard = page.getByRole('dialog', { name: 'Cambios sin guardar', exact: true });
  await expect(guard).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(form).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${managerPath}$`));
  await guard.getByRole('button', { name: 'Cerrar diálogo', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(guard.getByRole('button', { name: 'Salir sin guardar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(guard).toBeHidden();
  await expect(form).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(form.getByLabel('Título', { exact: true })).toHaveValue('Borrador que no debe perderse');
  await expect(form.getByRole('textbox', { name: /^Descripción/ })).toHaveValue('Primera línea.\n\nFicha de la nueva obra.');
  await expect(form.getByRole('checkbox', { name: 'Disponible', exact: true })).not.toBeChecked();
  expect(await form.locator('input[type="file"]').evaluate((element) => Array.from((element as HTMLInputElement).files ?? []).map((file) => file.name))).toEqual([image.name]);
  expect(await form.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  expect(writes(backend)).toEqual([]);
  expect(backend.state.uploads).toEqual([]);
});

test('the manager and artwork editor stay usable on 320 and 390px phones with native fields and no horizontal overflow', async ({ page, backend }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await openManager(page, backend);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 740 });
    expect(await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth)).toBeLessThanOrEqual(1);
    for (const name of ['Lienzos', 'Obra en papel', 'Nueva obra', 'Nueva colección']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
    const form = page.getByRole('dialog', { name: /^Añadir obra a / });
    await expect(form).toBeVisible();
    expect(await form.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await form.getByRole('checkbox', { name: 'Disponible', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(form.getByRole('checkbox', { name: 'Disponible', exact: true })).not.toBeChecked();
    await page.keyboard.press('Tab');
    await expect(form.getByRole('checkbox', { name: 'Visible al público', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(form).toBeHidden();
    expect(writes(backend)).toEqual([]);
  }
});

test('mock constraints reject cross-support moves atomically through both RPC and direct REST while allowing independent branch ordering', async ({ page, backend }) => {
  await page.goto('/');
  const original = catalog(backend);
  const crossed = payload(backend, { 'collection-canvas': ['artwork-wide', 'artwork-hidden'], 'collection-paper': ['artwork-square', 'artwork-paper'] });
  const response = await api(page, backend, '/rest/v1/rpc/reorganize_artworks', 'POST', crossed);
  expect(response.body).toMatchObject({ code: '23514', message: 'ARTWORK_BRANCH_MISMATCH' });
  expect(catalog(backend)).toEqual(original);
  const directMove = await api(page, backend, '/rest/v1/artworks?id=eq.artwork-square', 'PATCH', { collection_id: 'collection-paper' });
  expect(directMove.body).toMatchObject({ code: '23514', message: 'ARTWORK_BRANCH_MISMATCH' });
  const changeBranch = await api(page, backend, '/rest/v1/collections?id=eq.collection-canvas', 'PATCH', { support_kind: 'paper' });
  expect(changeBranch.body).toMatchObject({ code: '23514', message: 'COLLECTION_BRANCH_IMMUTABLE' });
  expect(catalog(backend)).toEqual(original);
  const independent = payload(backend, { 'collection-canvas': ['artwork-wide', 'artwork-square', 'artwork-hidden'], 'collection-paper': ['artwork-paper'] });
  expect(await api(page, backend, '/rest/v1/rpc/reorganize_artworks', 'POST', independent)).toEqual({ status: 200, body: null });
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!.sort_order).toBe(0);
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-paper')!.collection_id).toBe('collection-paper');
});

test('mock recent-collection and empty-delete protections preserve catalog and media while visibility remains editable', async ({ page, backend }) => {
  await page.goto('/');
  const original = catalog(backend);
  const recentPath = '/rest/v1/collections?id=eq.collection-recent-canvas';
  for (const change of [
    { title: 'No permitido' }, { slug: 'otro-slug' }, { is_recent: false }, { source: 'legacy-wordpress' },
    { translations: { en: { title: 'Renamed recent works' } } },
  ]) {
    const response = await api(page, backend, recentPath, 'PATCH', change);
    expect(response.body).toMatchObject({ code: '23514', message: 'RECENT_COLLECTION_PROTECTED' });
    expect(catalog(backend)).toEqual(original);
  }
  expect((await api(page, backend, recentPath, 'DELETE')).body).toMatchObject({ code: '23514', message: 'RECENT_COLLECTION_PROTECTED' });
  expect((await api(page, backend, '/rest/v1/collections?id=eq.collection-empty', 'PATCH', { is_recent: true })).body)
    .toMatchObject({ code: '23514', message: 'RECENT_COLLECTION_PROTECTED' });
  expect((await api(page, backend, '/rest/v1/collections', 'POST', { title: 'Obras recientes duplicadas', support_kind: 'canvas', is_recent: true })).body.code).toBe('23505');
  for (const [id, message] of [['collection-recent-canvas', 'RECENT_COLLECTION_PROTECTED'], ['collection-canvas', 'COLLECTION_NOT_EMPTY']]) {
    expect((await api(page, backend, '/rest/v1/rpc/delete_empty_collection', 'POST', { target_collection_id: id })).body).toMatchObject({ code: '23514', message });
  }
  expect(catalog(backend)).toEqual(original);
  expect((await api(page, backend, '/rest/v1/artworks?id=eq.artwork-square', 'PATCH', { is_available: false }, 'nonAdmin')).status).toBe(403);
  expect((await api(page, backend, recentPath, 'PATCH', { is_published: false })).status).toBe(200);
  expect(backend.state.tables.collections.find((row) => row.id === 'collection-recent-canvas')!.sort_order).toBe(-1);
  const publicRecent = await api(page, backend, '/rest/v1/collections?is_recent=eq.true', 'GET', undefined, null);
  expect(publicRecent.body.map((row: MockRow) => row.id)).toEqual(['collection-recent-paper']);
  expect(await api(page, backend, '/rest/v1/rpc/delete_empty_collection', 'POST', { target_collection_id: 'collection-empty' })).toEqual({ status: 200, body: null });
  expect(backend.state.tables.artworks).toEqual(original.artworks);
  expect(backend.state.deletedAssets).toEqual([]);
});
