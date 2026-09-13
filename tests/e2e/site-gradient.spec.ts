import type { Locator, Page } from '@playwright/test';
import { test, expect, MOCK_SUPABASE_URL, type MockSupabaseBackend } from '../helpers/mock-supabase';

type Gradient = { startColor: string; endColor: string };
const original: Gradient = { startColor: '#d4d0c3', endColor: '#77756f' };
const custom: Gradient = { startColor: '#e8ddd0', endColor: '#3f454a' };
const edited: Gradient = { startColor: '#f3e6d5', endColor: '#40372f' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('gradient-test-language-initialized')) {
      localStorage.setItem('toni-crespo-language', 'es');
      sessionStorage.setItem('gradient-test-language-initialized', 'yes');
    }
  });
});

function settings(backend: MockSupabaseBackend) {
  return backend.state.tables.site_settings.find((row) => row.key === 'global')!.value;
}

function settingsWrites(backend: MockSupabaseBackend) {
  return backend.requests.filter((request) => new URL(request.url).pathname === '/rest/v1/site_settings'
    && !['GET', 'HEAD'].includes(request.method));
}

function rgb(hex: string) {
  return `rgb(${[1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16)).join(', ')})`;
}

async function expectGradientImage(element: Locator, gradient: Gradient) {
  await expect(element).toHaveCSS('background-image', /linear-gradient/);
  const background = await element.evaluate((target) => getComputedStyle(target).backgroundImage);
  expect(background).toContain(rgb(gradient.startColor));
  expect(background).toContain(rgb(gradient.endColor));
  expect(background.indexOf(rgb(gradient.startColor))).toBeLessThan(background.lastIndexOf(rgb(gradient.endColor)));
  expect(background.match(/rgba?\(/g)).toHaveLength(2);
}

async function expectAppliedGradient(page: Page, gradient: Gradient) {
  await expect.poll(() => page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return { startColor: style.getPropertyValue('--gradient-start').trim(), endColor: style.getPropertyValue('--gradient-end').trim() };
  })).toEqual(gradient);
  await expectGradientImage(page.locator('.app-shell'), gradient);
  await expect(page.locator('body')).toHaveCSS('background-color', rgb(gradient.startColor));
  await expect(page.locator('.site-footer')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('.site-footer')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.site-footer__bottom')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
}

async function login(page: Page, backend: MockSupabaseBackend) {
  await page.goto('/');
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  await backend.signIn(page);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Configurar web', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Configuración general', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

function colorField(dialog: Locator, side: 'inicial' | 'final') {
  return dialog.getByRole('textbox', { name: new RegExp(`^Color ${side}`) });
}

async function editGradient(dialog: Locator, gradient: Gradient) {
  await colorField(dialog, 'inicial').fill(gradient.startColor);
  await colorField(dialog, 'final').fill(gradient.endColor);
}

async function expectDraft(dialog: Locator, gradient: Gradient) {
  await expect(colorField(dialog, 'inicial')).toHaveValue(gradient.startColor);
  await expect(colorField(dialog, 'final')).toHaveValue(gradient.endColor);
  await expect(dialog.getByLabel('Elegir color inicial', { exact: true })).toHaveValue(gradient.startColor);
  await expect(dialog.getByLabel('Elegir color final', { exact: true })).toHaveValue(gradient.endColor);
  const preview = dialog.getByRole('img', { name: 'Vista previa del fondo', exact: true });
  await expect(preview).toHaveClass(/site-gradient-preview/);
  await expectGradientImage(preview, gradient);
}

test('public custom gradient survives client navigation and reload while the footer stays white without writes', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  await page.goto('/');
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  await expectAppliedGradient(page, custom);
  await page.locator('.support-landing-card[href="/lienzos"]').click();
  await expect(page).toHaveURL(/\/lienzos$/);
  await expectAppliedGradient(page, custom);
  await page.evaluate(() => window.scrollTo(0, 0));
  const menu = page.locator('.header-menu-trigger');
  if (await menu.isVisible()) await menu.click();
  await page.locator('.main-nav a[href="/trayectoria"]').click();
  await expect(page).toHaveURL(/\/trayectoria$/);
  await expectAppliedGradient(page, custom);
  await page.reload();
  await expectAppliedGradient(page, custom);
  await expect(page.getByRole('button', { name: 'Configurar web', exact: true })).toHaveCount(0);
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('legacy, malformed and injected saved colors fall back safely without losing valid colors or contact settings', async ({ page, backend }) => {
  const cases: { stored: unknown; expected: Gradient }[] = [
    { stored: undefined, expected: original },
    { stored: null, expected: original },
    { stored: ['#ffffff', '#111111'], expected: original },
    { stored: { startColor: '#abc', endColor: 'red' }, expected: original },
    { stored: { startColor: '#101010; background: url(https://injected.example/image)', endColor: custom.endColor }, expected: { ...custom, startColor: original.startColor } },
    { stored: { startColor: '#AABBCC', endColor: 42 }, expected: { startColor: '#aabbcc', endColor: original.endColor } },
    { stored: { startColor: custom.startColor, endColor: '#12345678' }, expected: { ...custom, endColor: original.endColor } },
  ];
  for (const { stored, expected } of cases) {
    if (stored === undefined) delete settings(backend).gradient;
    else settings(backend).gradient = stored;
    await page.goto('/');
    await expectAppliedGradient(page, expected);
    await expect(page.locator('a.header-contact-trigger')).toHaveAttribute('href', 'mailto:studio@example.test');
  }
  expect(settingsWrites(backend)).toEqual([]);
  // The fixture deliberately blocks external fonts; an injected image must
  // never even be requested, independently of that normal test isolation.
  expect(backend.blockedRequests.filter((url) => new URL(url).hostname === 'injected.example')).toEqual([]);
});

test('legacy provider state renders the site and editor with safe colors before a delayed settings response arrives', async ({ page, backend, baseURL }) => {
  if (!baseURL) throw new Error('The regression requires the local Vite test server.');
  settings(backend).gradient = { ...custom };
  const appOrigin = new URL(baseURL).origin;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let injectedModules = 0;
  await page.route((url) => url.origin === appOrigin && url.pathname === '/src/app/sitePreferences.tsx', async (route) => {
    // Simulate the old in-memory shape without modifying source files, React,
    // the provider's rendering logic, or the mocked external HTTP boundary.
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const source = await response.text();
    const initializer = 'useState(defaultSiteSettings)';
    expect(source.split(initializer)).toHaveLength(2);
    const body = source.replace(initializer, 'useState(() => { const { gradient, ...legacy } = defaultSiteSettings; return legacy; })');
    injectedModules += 1;
    await route.fulfill({ response, body });
  });

  let releaseSettingsRead = () => {};
  const settingsReadGate = new Promise<void>((resolve) => { releaseSettingsRead = resolve; });
  let pendingSettingsReads = 0;
  let settingsReadsReleased = false;
  await page.route((url) => url.origin === MOCK_SUPABASE_URL && url.pathname === '/rest/v1/site_settings', async (route) => {
    if (route.request().method() === 'GET') {
      pendingSettingsReads += 1;
      await settingsReadGate;
      settingsReadsReleased = true;
    }
    await route.fallback();
  });
  // Always release the fixture, including assertion failures; no stalled route
  // can outlive the test indefinitely.
  const safetyRelease = setTimeout(releaseSettingsRead, 15_000);
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => injectedModules).toBe(1);
    await expect.poll(() => pendingSettingsReads).toBeGreaterThan(0);
    await expect(page.locator('#root .app-shell')).toBeVisible();
    await expect(page.locator('.site-header .brand')).toBeVisible();
    await expect(page.locator('.support-landing-card')).toHaveCount(2);
    await expectAppliedGradient(page, original);
    expect(settingsReadsReleased).toBe(false);
    expect(pageErrors).toEqual([]);

    await backend.signIn(page);
    let dialog = await openSettings(page);
    await expectDraft(dialog, original);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(settingsReadsReleased).toBe(false);
    expect(settingsWrites(backend)).toEqual([]);

    releaseSettingsRead();
    await expectAppliedGradient(page, custom);
    dialog = await openSettings(page);
    await expectDraft(dialog, custom);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(pageErrors).toEqual([]);
    expect(settingsWrites(backend)).toEqual([]);
  } finally {
    releaseSettingsRead();
    clearTimeout(safetyRelease);
  }
});

test('gradient controls preview only a draft, synchronize color pickers and discard cancel or Escape without writes', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  await login(page, backend);
  let dialog = await openSettings(page);
  await expectDraft(dialog, custom);
  await editGradient(dialog, edited);
  await expectDraft(dialog, edited);
  await expectAppliedGradient(page, custom);
  expect(settingsWrites(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(settings(backend).gradient).toEqual(custom);
  await expectAppliedGradient(page, custom);
  dialog = await openSettings(page);
  await expectDraft(dialog, custom);
  await dialog.getByLabel('Elegir color inicial', { exact: true }).fill(edited.startColor);
  await dialog.getByLabel('Elegir color final', { exact: true }).fill(edited.endColor);
  await expectDraft(dialog, edited);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expectAppliedGradient(page, custom);
  expect(settingsWrites(backend)).toEqual([]);
});

test('invalid gradient drafts cannot send a settings write or change the applied colors', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  await login(page, backend);
  const dialog = await openSettings(page);
  for (const [side, invalid] of [['inicial', '#12345g'], ['final', '#abc'], ['inicial', ''], ['final', 'red']] as const) {
    await editGradient(dialog, edited);
    const field = colorField(dialog, side);
    await field.fill(invalid);
    await dialog.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect.poll(async () => await field.evaluate((element) => element.matches(':invalid') || element.getAttribute('aria-invalid') === 'true')
      || await dialog.getByRole('alert').count() > 0).toBe(true);
    await expect(field).toHaveValue(invalid);
    await expectAppliedGradient(page, custom);
    expect(settingsWrites(backend)).toEqual([]);
    expect(settings(backend).gradient).toEqual(custom);
  }
});

test('failed gradient saves retain the draft and applied colors, then retry persists both colors and contact settings', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  const originalContact = structuredClone(settings(backend).contact);
  await login(page, backend);
  const dialog = await openSettings(page);
  await editGradient(dialog, edited);
  backend.failNext({ table: 'site_settings', method: 'POST', status: 500, message: 'No se pudo guardar el fondo de prueba' });
  await dialog.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar el fondo de prueba');
  await expectDraft(dialog, edited);
  await expectAppliedGradient(page, custom);
  expect(settings(backend).gradient).toEqual(custom);
  expect(settingsWrites(backend)).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectAppliedGradient(page, edited);
  expect(settingsWrites(backend)).toHaveLength(2);
  expect(settings(backend).gradient).toEqual(edited);
  expect(settings(backend).contact).toEqual(originalContact);
  const reopened = await openSettings(page);
  await expectDraft(reopened, edited);
  await reopened.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.reload();
  await expectAppliedGradient(page, edited);
  expect(settings(backend).gradient).toEqual(edited);
});

test('restoring original colors affects only the draft until saved and survives a reload', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  const originalContact = structuredClone(settings(backend).contact);
  await login(page, backend);
  let dialog = await openSettings(page);
  await dialog.getByRole('button', { name: 'Restaurar colores originales', exact: true }).click();
  await expectDraft(dialog, original);
  await expectAppliedGradient(page, custom);
  expect(settingsWrites(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  dialog = await openSettings(page);
  await expectDraft(dialog, custom);
  await dialog.getByRole('button', { name: 'Restaurar colores originales', exact: true }).click();
  await dialog.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectAppliedGradient(page, original);
  expect(settingsWrites(backend)).toHaveLength(1);
  expect(settings(backend).gradient).toEqual(original);
  expect(settings(backend).contact).toEqual(originalContact);
  await page.reload();
  await expectAppliedGradient(page, original);
});

test('a confirmed settings write applies its returned colors without a second read, even when later reads are unavailable', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  const originalContact = structuredClone(settings(backend).contact);
  await login(page, backend);
  const dialog = await openSettings(page);
  await editGradient(dialog, edited);
  const settingsReads = () => backend.requests.filter((request) => new URL(request.url).pathname === '/rest/v1/site_settings' && request.method === 'GET');
  const previousReadCount = settingsReads().length;
  backend.failNext({ table: 'site_settings', method: 'GET', status: 503, message: 'La siguiente lectura no está disponible' });
  await dialog.getByRole('button', { name: 'Guardar configuración', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expectAppliedGradient(page, edited);
  expect(settingsReads()).toHaveLength(previousReadCount);
  expect(settings(backend).gradient).toEqual(edited);
  expect(settings(backend).contact).toEqual(originalContact);
  const reopened = await openSettings(page);
  await expectDraft(reopened, edited);
  await reopened.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.header-language__trigger').click();
  const germanDefault = page.getByRole('menuitem', { name: 'Usar Deutsch como idioma predeterminado', exact: true });
  await germanDefault.click();
  await expect(germanDefault).toBeDisabled();
  await expect.poll(() => settings(backend).defaultLanguage).toBe('de');
  await expectAppliedGradient(page, edited);
  expect(settingsReads()).toHaveLength(previousReadCount);
  expect(settingsWrites(backend)).toHaveLength(2);
  expect(settings(backend).gradient).toEqual(edited);
  expect(settings(backend).contact).toEqual(originalContact);
  // Do not reload: that would deliberately consume the pending failed GET.
});

test('changing the default language from its flag preserves the saved gradient and every contact field, including retry', async ({ page, backend }) => {
  settings(backend).gradient = { ...custom };
  const originalContact = structuredClone(settings(backend).contact);
  await login(page, backend);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.header-language__trigger').click();
  const germanDefault = page.getByRole('menuitem', { name: 'Usar Deutsch como idioma predeterminado', exact: true });
  backend.failNext({ table: 'site_settings', method: 'POST', status: 500, message: 'Idioma de prueba no guardado' });
  await germanDefault.click();
  await expect(page.getByRole('menu').getByRole('alert')).toContainText('Idioma de prueba no guardado');
  expect(settings(backend).defaultLanguage).toBe('ca');
  await expectAppliedGradient(page, custom);
  await germanDefault.click();
  await expect(germanDefault).toBeDisabled();
  await expect.poll(() => settings(backend).defaultLanguage).toBe('de');
  expect(settings(backend).gradient).toEqual(custom);
  expect(settings(backend).contact).toEqual(originalContact);
  expect(settingsWrites(backend)).toHaveLength(2);
  await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Español/);
  await page.keyboard.press('Escape');
  await expectAppliedGradient(page, custom);
  await page.reload();
  await expectAppliedGradient(page, custom);
  expect(settings(backend).contact).toEqual(originalContact);
});

test('gradient settings fit a 320px phone and are reachable in keyboard order without applying unsaved colors', async ({ page, backend }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  settings(backend).gradient = { ...custom };
  await login(page, backend);
  const dialog = await openSettings(page);
  const controls = await dialog.locator('form input, form select, form button').all();
  await controls[0].focus();
  for (const [index, control] of controls.entries()) {
    await expect(control).toBeFocused();
    // Center controls in the dialog's scroll area; nearest-edge scrolling can
    // leave a fraction of a border outside the viewport at fractional offsets.
    await control.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    await expect(control).toBeInViewport({ ratio: 1 });
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    if (index + 1 < controls.length) await page.keyboard.press('Tab');
  }
  const field = colorField(dialog, 'inicial');
  await field.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(edited.startColor);
  await page.keyboard.press('Tab');
  await expectDraft(dialog, { ...custom, startColor: edited.startColor });
  await expectAppliedGradient(page, custom);
  for (const side of ['inicial', 'final']) {
    const picker = dialog.getByLabel(`Elegir color ${side}`, { exact: true });
    const bounds = (await picker.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await dialog.locator('.site-gradient-preview').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('gradient-settings-320.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(settingsWrites(backend)).toEqual([]);
});
