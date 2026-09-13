import type { Locator, Page } from '@playwright/test';
import { test, expect, MOCK_SUPABASE_URL, type MockSupabaseBackend, type MockRow } from '../helpers/mock-supabase';

// Real React UI, router, session and organizer service; external HTTP is local-only.
// The RPC double models permissions/transactions, not deployed Postgres locks or RLS.
const organizerPath = '/admin/contenido';
const rpcPath = '/rest/v1/rpc/reorganize_artworks';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('organizer-test-language-initialized')) {
      localStorage.setItem('toni-crespo-language', 'es');
      sessionStorage.setItem('organizer-test-language-initialized', 'yes');
    }
  });
});

function rpcRequests(backend: MockSupabaseBackend) {
  return backend.requests.filter((request) => new URL(request.url).pathname === rpcPath);
}

function catalogWrites(backend: MockSupabaseBackend) {
  return backend.requests.filter((request) => new URL(request.url).pathname.startsWith('/rest/v1/')
    && !new URL(request.url).pathname.endsWith('/rpc/is_admin') && !['GET', 'HEAD'].includes(request.method));
}

function catalog(backend: MockSupabaseBackend) {
  return structuredClone({ collections: backend.state.tables.collections, artworks: backend.state.tables.artworks });
}

function orderedIds(backend: MockSupabaseBackend, collectionId: string) {
  return backend.state.tables.artworks.filter((row) => row.collection_id === collectionId)
    .sort((a, b) => a.sort_order - b.sort_order).map((row) => row.id as string);
}

function organizationPayload(backend: MockSupabaseBackend, next: Record<string, string[]>) {
  return {
    expected_state: Object.keys(next).map((id) => ({ id, artworks: backend.state.tables.artworks
      .filter((row) => row.collection_id === id).map(({ id: artworkId, sort_order }) => ({ id: artworkId, sort_order })) })),
    next_state: Object.entries(next).map(([id, artwork_ids]) => ({ id, artwork_ids })),
  };
}

function editorialMetadata(row: MockRow) {
  const { collection_id, sort_order, updated_at, ...metadata } = row;
  return metadata;
}

async function openOrganizer(page: Page, backend: MockSupabaseBackend) {
  await page.goto('/');
  await backend.signIn(page);
  await page.getByRole('button', { name: 'Configurar web', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Configuración general', exact: true });
  await settings.getByRole('button', { name: 'Administrar contenido', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${organizerPath}$`));
  await expect(page.locator('.artwork-organizer')).toBeVisible();
  await expect(page.locator('.organizer-pane')).toHaveCount(2);
  await pane(page).getByRole('combobox').selectOption('collection-canvas');
  await pane(page, 'destination').getByRole('combobox').selectOption('collection-empty');
}

function pane(page: Page, side: 'source' | 'destination' = 'source') {
  return page.locator('.organizer-pane').nth(side === 'source' ? 0 : 1);
}

function card(container: Locator, title: string) {
  return container.locator('.organizer-artwork').filter({ has: container.page().getByRole('heading', { name: title, exact: true }) });
}

async function expectTitles(container: Locator, titles: string[]) {
  await expect(container.locator('.organizer-artwork-title')).toHaveText(titles);
}

async function moveWithDialog(page: Page, title: string, collectionId: string, index = 0) {
  await page.getByRole('button', { name: `Mover ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Mover ${title}`, exact: true });
  await dialog.getByRole('combobox', { name: 'Colección destino', exact: true }).selectOption(collectionId);
  await dialog.getByRole('combobox', { name: 'Posición', exact: true }).selectOption(String(index));
  await dialog.getByRole('button', { name: 'Aplicar al borrador', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function confirmSave(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar organización', exact: true });
  await dialog.getByRole('button', { name: 'Guardar organización', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function discardDraft(page: Page) {
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Descartar cambios', exact: true });
  await dialog.getByRole('button', { name: 'Descartar borrador', exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function pointerDrag(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('Both real drag targets must have layout boxes.');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
  await expect(page.locator('.organizer-drag-preview')).toBeVisible();
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height / 2, 100), { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.organizer-drag-preview')).toHaveCount(0);
}

function addHiddenCollection(backend: MockSupabaseBackend) {
  const template = backend.state.tables.collections.find((row) => row.id === 'collection-empty')!;
  backend.state.tables.collections.push({ ...structuredClone(template), id: 'collection-hidden', slug: 'archivo-privado', title: 'Archivo privado', is_published: false, sort_order: 9 });
}

async function callMockRpc(page: Page, backend: MockSupabaseBackend, payload: unknown, role: 'admin' | 'nonAdmin' | null) {
  return page.evaluate(async ({ origin, path, credentials, body }) => {
    let token = 'public-test-anon-key';
    if (credentials) {
      const authentication = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { 'content-type': 'application/json', apikey: 'public-test-anon-key' }, body: JSON.stringify(credentials),
      });
      token = (await authentication.json()).access_token;
    }
    const response = await fetch(`${origin}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: 'public-test-anon-key', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }, { origin: MOCK_SUPABASE_URL, path: rpcPath, credentials: role ? backend[role] : null, body: payload });
}

test('the organizer route never exposes editing controls or hidden works to visitors or non-admin sessions', async ({ page, backend }) => {
  await page.goto(organizerPath);
  await expect(page.locator('.organizer-access')).toBeVisible();
  await expect(page.locator('.organizer-workspace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Arrastrar / })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0);
  await expect(page.getByText('Obra reservada', { exact: true })).toHaveCount(0);
  // Start a legitimate mocked non-admin session without asking the protected
  // editor's login form to accept it. The real provider still checks is_admin.
  await page.evaluate(async ({ origin, credentials }) => {
    const response = await fetch(`${origin}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: 'public-test-anon-key' }, body: JSON.stringify(credentials),
    });
    localStorage.setItem('sb-test-project-auth-token', JSON.stringify(await response.json()));
  }, { origin: MOCK_SUPABASE_URL, credentials: backend.nonAdmin });
  await page.reload();
  await expect(page.locator('.organizer-access')).toBeVisible();
  await expect(page.locator('.organizer-workspace')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Arrastrar / })).toHaveCount(0);
  await expect(page.getByText('Obra reservada', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
  const login = page.getByRole('dialog', { name: 'Inicio de sesión de edición', exact: true });
  await login.getByLabel('Email admin').fill(backend.nonAdmin.email);
  await login.getByLabel('Contraseña', { exact: true }).fill(backend.nonAdmin.password);
  await login.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
  await expect(login.getByRole('alert')).toContainText('no tiene permisos de administración');
  await expect(page.locator('.organizer-workspace')).toHaveCount(0);
  await expect(page.getByText('Obra reservada', { exact: true })).toHaveCount(0);
  expect(catalogWrites(backend)).toEqual([]);
});

test('direct-route admin login waits for its private snapshot instead of freezing the previous public catalog', async ({ page, backend }) => {
  addHiddenCollection(backend);
  let releaseAdminRead = () => {};
  const adminReadGate = new Promise<void>((resolve) => { releaseAdminRead = resolve; });
  let adminReads = 0;
  const safety = setTimeout(releaseAdminRead, 20_000);
  await page.route((url) => url.origin === MOCK_SUPABASE_URL && url.pathname === '/rest/v1/collections', async (route) => {
    const token = route.request().headers().authorization?.split(' ')[1] ?? '';
    let role = '';
    try { role = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).mock_role; } catch { /* public key has no JWT payload */ }
    if (route.request().method() === 'GET' && role === 'admin') {
      adminReads += 1;
      await adminReadGate;
    }
    await route.fallback();
  });
  try {
    await page.goto(organizerPath);
    await expect(page.locator('.organizer-access')).toBeVisible();
    // The public provider has completed all its reads before login. Its
    // collection snapshot cannot contain hidden rows under the mock RLS model.
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
    const login = page.getByRole('dialog', { name: 'Inicio de sesión de edición', exact: true });
    await login.getByLabel('Email admin').fill(backend.admin.email);
    await login.getByLabel('Contraseña', { exact: true }).fill(backend.admin.password);
    await login.getByRole('button', { name: 'Entrar en modo edición', exact: true }).click();
    await expect(login).toBeHidden();
    await expect.poll(() => adminReads).toBeGreaterThan(0);
    await expect(page.locator('.organizer-pane')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cargando tus obras…', exact: true })).toBeVisible();
    releaseAdminRead();
    await expect(page.locator('.organizer-pane')).toHaveCount(2);
    await pane(page).getByRole('combobox').selectOption('collection-canvas');
    await expectTitles(pane(page), ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
    await expect(pane(page).getByRole('combobox').locator('option[value="collection-hidden"]')).toContainText('Archivo privado');
    expect(catalogWrites(backend)).toEqual([]);
  } finally {
    clearTimeout(safety);
    releaseAdminRead();
  }
});

test('an auth identity change immediately removes the previous administrator draft while new permissions are pending', async ({ page, backend }) => {
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  const original = catalog(backend);
  let releasePermission = () => {};
  const permissionGate = new Promise<void>((resolve) => { releasePermission = resolve; });
  let pendingChecks = 0;
  const safety = setTimeout(releasePermission, 20_000);
  await page.route((url) => url.origin === MOCK_SUPABASE_URL && url.pathname === '/rest/v1/rpc/is_admin', async (route) => {
    const token = route.request().headers().authorization?.split(' ')[1] ?? '';
    let role = '';
    try { role = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).mock_role; } catch { /* public key */ }
    if (role === 'nonAdmin') {
      pendingChecks += 1;
      await permissionGate;
    }
    await route.fallback();
  });
  try {
    // Exercise the real client's onAuthStateChange path (as when another
    // session replaces this identity), without reloading or patching React.
    const result = await page.evaluate(async (credentials) => {
      const clientModule = '/src/lib/supabaseClient.ts';
      const { supabase } = await import(clientModule);
      const { error } = await supabase.auth.signInWithPassword(credentials);
      return error?.message ?? null;
    }, backend.nonAdmin);
    expect(result).toBeNull();
    await expect.poll(() => pendingChecks).toBeGreaterThan(0);
    await expect(page.locator('.organizer-access')).toBeVisible();
    await expect(page.locator('.organizer-workspace')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toHaveCount(0);
    await expect(page.getByText('Obra reservada', { exact: true })).toHaveCount(0);
    releasePermission();
    await expect(page.getByRole('button', { name: 'Entrar en modo edición', exact: true })).toBeVisible();
    expect(catalog(backend)).toEqual(original);
    expect(catalogWrites(backend)).toEqual([]);
  } finally {
    clearTimeout(safety);
    releasePermission();
  }
});

test('settings opens the admin comparison with complete hidden/empty collections and search never mutates the catalog', async ({ page, backend }) => {
  addHiddenCollection(backend);
  const original = catalog(backend);
  await openOrganizer(page, backend);
  const source = pane(page);
  const destination = pane(page, 'destination');
  await source.getByRole('combobox').selectOption('collection-canvas');
  await destination.getByRole('combobox').selectOption('collection-empty');
  await expectTitles(source, ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
  await expectTitles(destination, []);
  await expect(source.getByRole('combobox').locator('option[value="collection-hidden"]')).toContainText('Archivo privado');
  await destination.getByRole('combobox').selectOption('collection-hidden');
  await expectTitles(destination, []);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rehacer', exact: true })).toBeDisabled();
  await page.getByRole('searchbox').fill('mar sereno');
  await expectTitles(source, ['Mar sereno']);
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
  await page.getByRole('searchbox').fill('no existe ninguna obra');
  await expectTitles(source, []);
  await page.getByRole('searchbox').fill('');
  await expectTitles(source, ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
});

test('opening the organizer asks before discarding unsaved general settings', async ({ page, backend }) => {
  await page.goto('/');
  await backend.signIn(page);
  await page.getByRole('button', { name: 'Configurar web', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Configuración general', exact: true });
  await settings.getByRole('textbox', { name: 'Correo destinatario', exact: true }).fill('draft@example.test');
  await settings.getByRole('button', { name: 'Administrar contenido', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Configuración sin guardar', exact: true });
  await expect(guard).toBeVisible();
  await expect(page).not.toHaveURL(new RegExp(`${organizerPath}$`));
  await guard.getByRole('button', { name: 'Volver a configuración', exact: true }).click();
  await expect(settings.getByRole('textbox', { name: 'Correo destinatario', exact: true })).toHaveValue('draft@example.test');
  await settings.getByRole('button', { name: 'Administrar contenido', exact: true }).click();
  await guard.getByRole('button', { name: 'Descartar y abrir gestor', exact: true }).click();
  await expect(page.locator('.organizer-workspace')).toBeVisible();
  expect(backend.state.tables.site_settings[0].value.contact.email).toBe('studio@example.test');
  expect(catalogWrites(backend)).toEqual([]);
});

test('keyboard action buttons reorder the complete draft with undo, redo, cancellation and explicit discard', async ({ page, backend }) => {
  const original = catalog(backend);
  await openOrganizer(page, backend);
  const source = pane(page);
  await source.getByRole('combobox').selectOption('collection-canvas');
  await page.getByRole('button', { name: 'Retrasar Mar sereno', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expectTitles(source, ['Horizonte abierto', 'Mar sereno', 'Obra reservada']);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expectTitles(source, ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
  await expectTitles(source, ['Horizonte abierto', 'Mar sereno', 'Obra reservada']);
  await page.getByRole('button', { name: 'Adelantar Obra reservada', exact: true }).click();
  await expectTitles(source, ['Horizonte abierto', 'Obra reservada', 'Mar sereno']);
  await page.getByRole('button', { name: 'Descartar cambios', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Descartar cambios', exact: true });
  await dialog.getByRole('button', { name: 'Seguir organizando', exact: true }).click();
  await expectTitles(source, ['Horizonte abierto', 'Obra reservada', 'Mar sereno']);
  await discardDraft(page);
  await expectTitles(source, ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rehacer', exact: true })).toBeDisabled();
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
});

test('moving into empty and hidden collections stays draft-only until one atomic save and reflects publicly after reload', async ({ page, backend }) => {
  addHiddenCollection(backend);
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  await moveWithDialog(page, 'Obra reservada', 'collection-hidden');
  await expectTitles(pane(page, 'destination'), ['Obra reservada']);
  await expect(pane(page, 'destination')).toContainText('Colección oculta al público');
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Guardar organización', exact: true });
  await expect(confirmation).toContainText('Mar sereno');
  await expect(confirmation).toContainText('Obra reservada');
  expect(rpcRequests(backend)).toEqual([]);
  await confirmation.getByRole('button', { name: 'Guardar organización', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(page.locator('.organizer-success')).toContainText('Organización guardada');
  expect(catalogWrites(backend)).toHaveLength(1);
  expect(rpcRequests(backend)).toHaveLength(1);
  const request = rpcRequests(backend)[0].body;
  expect(request.expected_state.map((collection: MockRow) => collection.id).sort()).toEqual(['collection-canvas', 'collection-empty', 'collection-hidden']);
  expect(request.expected_state.find((collection: MockRow) => collection.id === 'collection-canvas').artworks)
    .toEqual(expect.arrayContaining([{ id: 'artwork-hidden', sort_order: 3 }]));
  expect(orderedIds(backend, 'collection-canvas')).toEqual(['artwork-wide']);
  expect(orderedIds(backend, 'collection-empty')).toEqual(['artwork-square']);
  expect(orderedIds(backend, 'collection-hidden')).toEqual(['artwork-hidden']);
  expect(backend.state.tables.collections.find((row) => row.id === 'collection-hidden')!.cover_image_url).toBeNull();
  for (const row of backend.state.tables.artworks) {
    expect(editorialMetadata(row)).toEqual(editorialMetadata(original.artworks.find((previous) => previous.id === row.id)!));
  }
  expect(backend.state.tables.collections.find((row) => row.id === 'collection-hidden')!.is_published).toBe(false);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Deshacer', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator('.organizer-access')).toBeVisible();
  await page.getByRole('button', { name: 'Activar modo edición', exact: true }).click();
  await expect(page.locator('.organizer-workspace')).toBeVisible();
  await pane(page).getByRole('combobox').selectOption('collection-empty');
  await expectTitles(pane(page), ['Mar sereno']);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cerrar sesión', exact: true }).getByRole('button', { name: 'Confirmar cierre de sesión', exact: true }).click();
  await page.goto('/lienzos/coleccion-vacia');
  await expect(page.locator('.artwork-showcase__meta h3, .artwork-showcase__meta h2')).toHaveText(['Mar sereno']);
  await page.goto('/lienzos/horizontes');
  await expect(page.locator('.artwork-showcase__meta h3, .artwork-showcase__meta h2')).toHaveText(['Horizonte abierto']);
  await expect(page.getByRole('heading', { name: 'Obra reservada', exact: true })).toHaveCount(0);
  await page.goto('/lienzos');
  await expect(page.locator('.support-collection-preview-card__title')).not.toContainText(['Archivo privado']);
  expect(catalogWrites(backend)).toHaveLength(1);
  expect(backend.state.uploads).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('real desktop mouse dragging reorders cards, moves to an empty collection and cancels outside without publishing', async ({ page, backend, isMobile }) => {
  test.skip(isMobile, 'Physical mouse sensor is covered by the desktop project; touch has its own native-input case.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await pointerDrag(page, page.getByRole('button', { name: 'Arrastrar Mar sereno', exact: true }), card(pane(page), 'Horizonte abierto'));
  await expectTitles(pane(page), ['Horizonte abierto', 'Mar sereno', 'Obra reservada']);
  await pointerDrag(page, page.getByRole('button', { name: 'Arrastrar Mar sereno', exact: true }), pane(page, 'destination').locator('.organizer-empty'));
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  const handle = page.getByRole('button', { name: 'Arrastrar Horizonte abierto', exact: true });
  const box = await handle.boundingBox();
  if (!box) throw new Error('A visible drag handle is required.');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y + 20);
  await expect(page.locator('.organizer-drag-preview')).toBeVisible();
  await page.mouse.move(5, 5, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.organizer-drag-preview')).toHaveCount(0);
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
});

test('keyboard drag supports space, directional movement and Escape without requiring a pointer', async ({ page, backend }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openOrganizer(page, backend);
  const handle = page.getByRole('button', { name: 'Arrastrar Mar sereno', exact: true });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.organizer-drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(card(pane(page), 'Horizonte abierto')).toHaveClass(/is-over/);
  await page.keyboard.press('Space');
  await expectTitles(pane(page), ['Horizonte abierto', 'Mar sereno', 'Obra reservada']);
  await expect(handle).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('.organizer-drag-preview')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Escape');
  await expect(page.locator('.organizer-drag-preview')).toHaveCount(0);
  await expectTitles(pane(page), ['Horizonte abierto', 'Mar sereno', 'Obra reservada']);
  await expect(handle).toBeFocused();
  expect(catalogWrites(backend)).toEqual([]);
});

test('native touch long-press dragging can move a work between comparison panels without writes', async ({ page, backend, isMobile }) => {
  test.skip(!isMobile, 'This case requires the touch-enabled browser context.');
  await page.setViewportSize({ width: 820, height: 1100 });
  await openOrganizer(page, backend);
  const handle = page.getByRole('button', { name: 'Arrastrar Mar sereno', exact: true });
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox();
  const to = await pane(page, 'destination').locator('.organizer-empty').boundingBox();
  if (!from || !to) throw new Error('Touch drag requires visible source and destination boxes.');
  const cdp = await page.context().newCDPSession(page);
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + 80 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1, radiusX: 5, radiusY: 5 }] });
  // Wait on the observable activation, not an invented HTML drag event. The
  // production TouchSensor deliberately requires a 180 ms stationary press.
  await expect(page.locator('.organizer-drag-preview')).toBeVisible();
  for (let step = 1; step <= 12; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{
      x: start.x + (end.x - start.x) * step / 12, y: start.y + (end.y - start.y) * step / 12, id: 1, radiusX: 5, radiusY: 5,
    }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  await expect(page.locator('.organizer-drag-preview')).toHaveCount(0);
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  expect(catalogWrites(backend)).toEqual([]);
});

test('failed saves preserve the full draft and retry publishes exactly once after explicit confirmation', async ({ page, backend }) => {
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  backend.failNext({ path: rpcPath, method: 'POST', message: 'Guardado de prueba interrumpido' });
  await confirmSave(page);
  await expect(page.getByRole('alert')).toContainText('Guardado de prueba interrumpido');
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
  expect(catalog(backend)).toEqual(original);
  expect(rpcRequests(backend)).toHaveLength(1);
  const firstAttempt = structuredClone(rpcRequests(backend)[0].body);
  await confirmSave(page);
  await expect(page.locator('.organizer-success')).toContainText('Organización guardada');
  expect(rpcRequests(backend)).toHaveLength(2);
  expect(rpcRequests(backend)[1].body).toEqual(firstAttempt);
  expect(orderedIds(backend, 'collection-empty')).toEqual(['artwork-square']);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
});

test('concurrent catalog changes reject the entire save and retain the draft until confirmed reload', async ({ page, backend }) => {
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!.sort_order = 8;
  const concurrentCatalog = catalog(backend);
  await confirmSave(page);
  await expect(page.getByRole('alert')).toContainText('El catálogo ha cambiado');
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  expect(catalog(backend)).toEqual(concurrentCatalog);
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Recargar el catálogo', exact: true });
  await guard.getByRole('button', { name: 'Seguir organizando', exact: true }).click();
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  await guard.getByRole('button', { name: 'Descartar y recargar', exact: true }).click();
  await expect(guard).toBeHidden();
  await expectTitles(pane(page), ['Mar sereno', 'Obra reservada', 'Horizonte abierto']);
  await expectTitles(pane(page, 'destination'), []);
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  expect(catalog(backend)).toEqual(concurrentCatalog);
  expect(rpcRequests(backend)).toHaveLength(1);
});

test('reloading after a selected collection is deleted keeps two distinct comparison panes and sortable IDs', async ({ page, backend }) => {
  const template = backend.state.tables.collections.find((row) => row.id === 'collection-empty')!;
  backend.state.tables.collections.push({ ...structuredClone(template), id: 'collection-removable', slug: 'coleccion-temporal', title: 'Colección temporal', sort_order: 3 });
  await openOrganizer(page, backend);
  await pane(page).getByRole('combobox').selectOption('collection-removable');
  await pane(page, 'destination').getByRole('combobox').selectOption('collection-canvas');
  await moveWithDialog(page, 'Mar sereno', 'collection-removable');
  backend.state.tables.collections = backend.state.tables.collections.filter((row) => row.id !== 'collection-removable');
  backend.state.tables.artworks = backend.state.tables.artworks.filter((row) => row.collection_id !== 'collection-removable');
  const externallyChanged = catalog(backend);
  await confirmSave(page);
  await expect(page.getByRole('alert')).toContainText('El catálogo ha cambiado');
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Recargar el catálogo', exact: true });
  await guard.getByRole('button', { name: 'Descartar y recargar', exact: true }).click();
  await expect(guard).toBeHidden();
  await expect(page.locator('.organizer-pane')).toHaveCount(2);
  const collectionIds = await page.locator('.organizer-pane').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-collection-id')));
  expect(collectionIds.sort()).toEqual(['collection-canvas', 'collection-empty']);
  const artworkIds = await page.locator('.organizer-artwork').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-artwork-id')));
  expect(new Set(artworkIds).size).toBe(artworkIds.length);
  expect(artworkIds).toHaveLength(3);
  expect(catalog(backend)).toEqual(externallyChanged);
  expect(rpcRequests(backend)).toHaveLength(1);
});

test('a confirmed RPC followed by a read failure cannot accidentally publish twice and recovers by reloading', async ({ page, backend }) => {
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  backend.failNext({ table: 'collections', method: 'GET', message: 'No se pudo leer el catálogo guardado' });
  await confirmSave(page);
  await expect(page.getByRole('alert')).toContainText('se ha guardado, pero no se ha podido recargar');
  await expect(page.locator('.organizer-status')).toContainText('Guardado · pendiente de recargar');
  await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mover Mar sereno', exact: true })).toBeDisabled();
  expect(rpcRequests(backend)).toHaveLength(1);
  expect(orderedIds(backend, 'collection-empty')).toEqual(['artwork-square']);
  await page.getByRole('button', { name: 'Recargar catálogo', exact: true }).click();
  await expect(page.locator('.organizer-success')).toContainText('Catálogo actualizado');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Mover Mar sereno', exact: true })).toBeEnabled();
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  expect(rpcRequests(backend)).toHaveLength(1);
});

test('missing RPC and expired permissions show actionable errors without losing draft or overwriting data', async ({ page, backend }) => {
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  for (const failure of [
    { code: 'PGRST202', status: 404, message: 'Could not find public.reorganize_artworks in the schema cache', expected: 'Falta activar el organizador en Supabase' },
    { code: '42501', status: 403, message: 'permission denied for function reorganize_artworks', expected: 'Tu sesión no tiene permisos' },
  ]) {
    backend.failNext({ path: rpcPath, method: 'POST', ...failure });
    await confirmSave(page);
    await expect(page.getByRole('alert')).toContainText(failure.expected);
    await expectTitles(pane(page, 'destination'), ['Mar sereno']);
    await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
    expect(catalog(backend)).toEqual(original);
  }
  expect(rpcRequests(backend)).toHaveLength(2);
});

test('navigation and browser-unload guards keep the unpublished draft until leaving is explicitly confirmed', async ({ page, backend }) => {
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(true);
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Cambios sin guardar', exact: true });
  await expect(guard).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(guard).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`${organizerPath}$`));
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  await guard.getByRole('button', { name: 'Salir sin guardar', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
  expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
});

test('browser Back from an open move or save dialog shows one focused leave guard and restores the previous dialog on cancel', async ({ page, backend }) => {
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  for (const action of [
    { button: 'Mover Horizonte abierto', dialog: 'Mover Horizonte abierto' },
    { button: 'Guardar cambios', dialog: 'Guardar organización' },
  ]) {
    await page.getByRole('button', { name: action.button, exact: true }).click();
    const previousDialog = page.getByRole('dialog', { name: action.dialog, exact: true });
    await expect(previousDialog).toBeVisible();
    await page.evaluate(() => window.history.back());
    const guard = page.getByRole('dialog', { name: 'Cambios sin guardar', exact: true });
    await expect(guard).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(previousDialog).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${organizerPath}$`));
    await guard.getByRole('button', { name: 'Cerrar diálogo', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(guard.getByRole('button', { name: 'Salir sin guardar', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(guard.getByRole('button', { name: 'Cerrar diálogo', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(guard).toHaveCount(0);
    await expect(previousDialog).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    expect(await previousDialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(previousDialog).toHaveCount(0);
    await expectTitles(pane(page, 'destination'), ['Mar sereno']);
    await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeEnabled();
    expect(catalog(backend)).toEqual(original);
    expect(catalogWrites(backend)).toEqual([]);
  }
});

test('logout requires confirmation, preserves draft on cancellation and removes private data after sign-out', async ({ page, backend }) => {
  const original = catalog(backend);
  await openOrganizer(page, backend);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Cerrar sesión', exact: true });
  await expect(guard).toContainText('Tienes cambios sin guardar');
  await guard.getByRole('button', { name: 'Seguir organizando', exact: true }).click();
  await expectTitles(pane(page, 'destination'), ['Mar sereno']);
  expect(backend.requests.filter((request) => new URL(request.url).pathname === '/auth/v1/logout')).toEqual([]);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await guard.getByRole('button', { name: 'Descartar y cerrar sesión', exact: true }).click();
  await expect(page.locator('.organizer-access')).toBeVisible();
  await expect(page.locator('.organizer-workspace')).toHaveCount(0);
  await expect(page.getByText('Obra reservada', { exact: true })).toHaveCount(0);
  expect(catalog(backend)).toEqual(original);
  expect(catalogWrites(backend)).toEqual([]);
  expect(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true })))).toBe(false);
});

test('phone controls and move dialog fit 320 and 390px with 44px targets, trapped keyboard focus and accessible alternatives', async ({ page, backend }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await openOrganizer(page, backend);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 });
    const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByRole('combobox', { name: 'Colección de origen', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Colección de destino', exact: true })).toBeVisible();
    const targets = await page.locator('.artwork-organizer button, .artwork-organizer select, .artwork-organizer input').evaluateAll((elements) => elements
      .filter((element) => element.getClientRects().length > 0).map((element) => {
        const rect = element.getBoundingClientRect();
        return { label: element.getAttribute('aria-label') || element.textContent, width: rect.width, height: rect.height };
      }));
    for (const target of targets) {
      expect(target.height, `${width}px ${target.label}`).toBeGreaterThanOrEqual(43.5);
      expect(target.width, `${width}px ${target.label}`).toBeGreaterThanOrEqual(43.5);
    }
    await page.getByRole('button', { name: 'Mover Mar sereno', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Mover Mar sereno', exact: true });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const close = dialog.getByRole('button', { name: 'Cerrar diálogo', exact: true });
    await close.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Aplicar al borrador', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Mover Mar sereno', exact: true })).toBeFocused();
    await moveWithDialog(page, 'Mar sereno', 'collection-empty');
    await expectTitles(pane(page, 'destination'), ['Mar sereno']);
    await discardDraft(page);
    await expectTitles(pane(page), ['Mar sereno', 'Horizonte abierto', 'Obra reservada']);
  }
  expect(catalogWrites(backend)).toEqual([]);
});

test('search-filtered moves still send the complete hidden-inclusive collection snapshot', async ({ page, backend }) => {
  await openOrganizer(page, backend);
  await page.getByRole('searchbox').fill('mar sereno');
  await expectTitles(pane(page), ['Mar sereno']);
  await moveWithDialog(page, 'Mar sereno', 'collection-empty');
  await expectTitles(pane(page), []);
  await confirmSave(page);
  await expect(page.locator('.organizer-success')).toContainText('Organización guardada');
  const payload = rpcRequests(backend)[0].body;
  expect(payload.expected_state.find((collection: MockRow) => collection.id === 'collection-canvas').artworks).toHaveLength(3);
  expect(payload.next_state.find((collection: MockRow) => collection.id === 'collection-canvas').artwork_ids).toEqual(['artwork-wide', 'artwork-hidden']);
  await page.getByRole('searchbox').fill('');
  await expectTitles(pane(page), ['Horizonte abierto', 'Obra reservada']);
  expect(backend.state.tables.artworks).toHaveLength(4);
});

test('mock organizer RPC refuses visitors, malformed membership and stale snapshots without partial changes', async ({ page, backend }) => {
  await page.goto('/');
  const original = catalog(backend);
  const payload = organizationPayload(backend, {
    'collection-canvas': ['artwork-wide', 'artwork-hidden'],
    'collection-empty': ['artwork-square'],
  });
  for (const role of [null, 'nonAdmin'] as const) {
    const denied = await callMockRpc(page, backend, payload, role);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('42501');
    expect(catalog(backend)).toEqual(original);
  }
  const duplicate = structuredClone(payload);
  duplicate.next_state[1].artwork_ids.push('artwork-wide');
  const invalid = await callMockRpc(page, backend, duplicate, 'admin');
  expect(invalid.status).toBe(400);
  expect(invalid.body.code).toBe('22023');
  expect(catalog(backend)).toEqual(original);

  // Omitting a hidden work from both sides is still a stale/incomplete snapshot.
  const incomplete = structuredClone(payload);
  incomplete.expected_state[0].artworks = incomplete.expected_state[0].artworks.filter((row) => row.id !== 'artwork-hidden');
  incomplete.next_state[0].artwork_ids = ['artwork-wide'];
  const hiddenConflict = await callMockRpc(page, backend, incomplete, 'admin');
  expect(hiddenConflict.body.code).toBe('40001');
  expect(catalog(backend)).toEqual(original);
  const stale = structuredClone(payload);
  stale.expected_state[0].artworks[0].sort_order += 1;
  const conflict = await callMockRpc(page, backend, stale, 'admin');
  expect(conflict.status).toBe(500);
  expect(conflict.body.code).toBe('40001');
  expect(catalog(backend)).toEqual(original);
});

test('mock organizer transaction preserves editorial fields, hidden flags and untouched collections while refreshing covers', async ({ page, backend }) => {
  await page.goto('/');
  const original = catalog(backend);
  const payload = organizationPayload(backend, {
    'collection-canvas': ['artwork-hidden', 'artwork-wide'],
    'collection-empty': ['artwork-square'],
  });
  expect(await callMockRpc(page, backend, payload, 'admin')).toEqual({ status: 200, body: null });
  expect(orderedIds(backend, 'collection-canvas')).toEqual(['artwork-hidden', 'artwork-wide']);
  expect(orderedIds(backend, 'collection-empty')).toEqual(['artwork-square']);
  for (const row of backend.state.tables.artworks) {
    expect(editorialMetadata(row)).toEqual(editorialMetadata(original.artworks.find((previous) => previous.id === row.id)!));
  }
  expect(backend.state.tables.collections.find((row) => row.id === 'collection-canvas')!.cover_image_url)
    .toBe(original.artworks.find((row) => row.id === 'artwork-wide')!.image_url);
  expect(backend.state.tables.collections.find((row) => row.id === 'collection-empty')!.cover_image_url)
    .toBe(original.artworks.find((row) => row.id === 'artwork-square')!.image_url);
  expect(backend.state.tables.collections.find((row) => row.id === 'collection-paper'))
    .toEqual(original.collections.find((row) => row.id === 'collection-paper'));
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-paper'))
    .toEqual(original.artworks.find((row) => row.id === 'artwork-paper'));
  expect(backend.state.tables.artworks.find((row) => row.id === 'artwork-hidden')!.is_published).toBe(false);
  expect(backend.state.uploads).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
});
