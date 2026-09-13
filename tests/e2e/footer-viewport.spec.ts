import type { Page } from '@playwright/test';
import { test, expect } from '../helpers/mock-supabase';

// Resizing a browser exercises layout viewport changes, not Safari's browser
// chrome or rubber-band overscroll. The same geometry can run in WebKit when
// that engine is configured, without claiming to emulate a physical iPhone.
const mobileViewports = [
  { width: 390, height: 844 },
  { width: 390, height: 664 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 390, height: 664 },
  { width: 390, height: 844 },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('toni-crespo-language', 'es'));
});

async function footerGeometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('.app-shell > main')!;
    const footer = document.querySelector('.site-footer')!;
    const header = document.querySelector('.site-header')!;
    const mainBox = main.getBoundingClientRect();
    const footerBox = footer.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const inFlowChildren = [...main.children].filter((child) => {
      const style = getComputedStyle(child);
      return style.display !== 'none' && !['absolute', 'fixed'].includes(style.position);
    });
    // Short-page fixtures have one ordinary section. Its actual height and
    // margins describe needed content space independently of main's min-height.
    const contentHeight = inFlowChildren.reduce((height, child) => {
      const style = getComputedStyle(child);
      return height + child.getBoundingClientRect().height
        + (Number.parseFloat(style.marginTop) || 0) + (Number.parseFloat(style.marginBottom) || 0);
    }, Number.parseFloat(mainStyle.paddingTop) + Number.parseFloat(mainStyle.paddingBottom));
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      visualViewportHeight: visualViewport?.height ?? innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      scrollY,
      footerCount: document.querySelectorAll('.site-footer').length,
      footerTop: footerBox.top,
      footerBottom: footerBox.bottom,
      footerHeight: footerBox.height,
      footerPosition: getComputedStyle(footer).position,
      footerDocumentGap: document.documentElement.scrollHeight - (scrollY + footerBox.bottom),
      headerHeight: header.getBoundingClientRect().height,
      mainTop: mainBox.top,
      mainBottom: mainBox.bottom,
      mainHeight: mainBox.height,
      contentHeight,
      contentBottom: Math.max(mainBox.top, ...inFlowChildren.map((child) => child.getBoundingClientRect().bottom)),
      footerBackground: getComputedStyle(footer).backgroundColor,
      documentBackground: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });
}

async function atDocumentEnd(page: Page) {
  await expect(page.locator('.site-footer')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(async () => {
    const box = await footerGeometry(page);
    return Math.abs(box.viewportHeight - box.footerBottom);
  }, { message: 'The footer must reach the visible end after scrolling, including after a viewport resize' }).toBeLessThanOrEqual(1);
  const box = await footerGeometry(page);
  expect(box.footerCount).toBe(1);
  expect(Math.abs(box.footerDocumentGap), 'No document space can remain below the footer').toBeLessThanOrEqual(1);
  expect(box.documentWidth, 'The footer must not introduce horizontal scrolling').toBeLessThanOrEqual(box.viewportWidth + 1);
  expect(box.footerBackground).toBe('rgb(255, 255, 255)');
  // This verifies the paint behind the footer, not physical iOS overscroll.
  expect(box.documentBackground).toBe('rgb(255, 255, 255)');
  expect(box.bodyBackground).toBe('rgb(255, 255, 255)');
  expect(['absolute', 'fixed']).not.toContain(box.footerPosition);
  expect(box.footerTop, 'The footer stays after main instead of covering it').toBeGreaterThanOrEqual(box.mainBottom - 1);
  expect(box.contentBottom, 'The content stays inside main above the footer').toBeLessThanOrEqual(box.mainBottom + 1);
  return box;
}

async function reachableFooterControls(page: Page) {
  const footer = page.locator('.site-footer');
  const contacts = footer.locator('.site-footer__contact a');
  await expect(contacts).toHaveCount(3);
  await expect(contacts.nth(0)).toHaveAttribute('href', 'mailto:studio@example.test');
  await expect(contacts.nth(1)).toHaveAttribute('href', 'tel:+34600111222');
  await expect(contacts.nth(2)).toHaveAttribute('href', 'https://www.instagram.com/toni.fixture/');
  for (const control of await footer.locator('.site-footer__contact a, .site-footer__editor-actions button').all()) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport({ ratio: 1 });
    await expect(control).toBeEnabled();
    expect(await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === element || (hit !== null && element.contains(hit));
    }), 'Every contact and editor button remains reachable, not covered by another layer').toBe(true);
  }
}

for (const path of ['/footer-page-not-found', '/lienzos/coleccion-vacia']) {
  test(`${path}: a short page fills the current viewport without artificial main height or a gap after the footer`, async ({ page, backend }, testInfo) => {
    await page.goto(path);
    await expect(page.locator('main h1')).toHaveText(path.includes('coleccion-vacia') ? 'Colección vacía' : 'Pagina no encontrada');
    const samples = [];
    for (const viewport of [{ width: 1440, height: 900 }, ...mobileViewports]) {
      await page.setViewportSize(viewport);
      const box = await atDocumentEnd(page);
      const neededHeight = box.headerHeight + box.contentHeight + box.footerHeight;
      const expectedHeight = Math.max(box.viewportHeight, neededHeight);
      expect(Math.abs(box.documentHeight - expectedHeight), 'Only real content may require scrolling; remaining height belongs to main').toBeLessThanOrEqual(1);
      if (neededHeight <= box.viewportHeight) {
        expect(box.scrollY, 'A short page that fits must not need an extra swipe to reach the footer').toBe(0);
        expect(Math.abs(box.documentHeight - box.viewportHeight)).toBeLessThanOrEqual(1);
      }
      if (path.includes('coleccion-vacia') && samples.length === 1) {
        await page.screenshot({ path: testInfo.outputPath('short-page-footer-390.png') });
      }
      await reachableFooterControls(page);
      samples.push(box);
    }
    expect(samples.some((box) => box.viewportWidth === 390 && box.scrollY === 0)).toBe(true);
    await testInfo.attach('short-page-footer-geometry', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
    expect(backend.requests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
  });
}

for (const [path, readySelector] of [
  ['/', '.home-statement-section'],
  ['/noticias', '.news-card'],
  ['/trayectoria', '.biography-poem'],
]) {
  test(`${path}: a long page keeps its footer after all content through height changes and orientation`, async ({ page, backend }, testInfo) => {
    await page.goto(path);
    await expect(page.locator(readySelector).first()).toBeVisible();
    const samples = [];
    for (const viewport of mobileViewports) {
      await page.setViewportSize(viewport);
      samples.push(await atDocumentEnd(page));
      if (path === '/noticias' && samples.length === 1) {
        await page.screenshot({ path: testInfo.outputPath('long-page-footer-390.png') });
      }
      await reachableFooterControls(page);
    }
    expect(samples.some((box) => box.documentHeight > box.viewportHeight)).toBe(true);
    await testInfo.attach('long-page-footer-geometry', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' });
    expect(backend.requests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
  });
}

test('the footer remains in flow during delayed content loading and returns to the viewport bottom after an empty collection loads', async ({ page, backend }) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/rest/v1/collections?*', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto('/lienzos/coleccion-vacia');
    await expect(page.locator('.page-loader')).toBeVisible();
    await atDocumentEnd(page);
    await page.setViewportSize({ width: 390, height: 664 });
    await atDocumentEnd(page);
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'Colección vacía', exact: true })).toBeVisible();
  await expect(page.locator('.page-loader')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const loaded = await atDocumentEnd(page);
  expect(loaded.scrollY).toBe(0);
  await reachableFooterControls(page);
  expect(backend.requests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
});

test('a failed public read cannot strand the footer, and reloading restores a short collection without leftover page height', async ({ page, backend }) => {
  let readUnavailable = true;
  let rejectedReads = 0;
  // Keep every initial request unavailable, including StrictMode's repeated
  // effect, until recovery is explicitly enabled before the reload.
  await page.route('**/rest/v1/collections?*', async (route) => {
    if (readUnavailable && route.request().method() === 'GET') {
      rejectedReads += 1;
      await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, json: { message: 'Lectura temporalmente no disponible', code: 'TEST_READ_UNAVAILABLE' } });
    } else await route.fallback();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lienzos/coleccion-vacia');
  await expect(page.locator('.admin-toast')).toContainText('Lectura temporalmente no disponible');
  await expect(page.locator('.page-loader')).toHaveCount(0);
  for (const viewport of [mobileViewports[0], mobileViewports[1], mobileViewports[3]]) {
    await page.setViewportSize(viewport);
    await atDocumentEnd(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(rejectedReads).toBeGreaterThan(0);
  readUnavailable = false;
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Colección vacía', exact: true })).toBeVisible();
  await expect(page.locator('.admin-toast')).toHaveCount(0);
  expect((await atDocumentEnd(page)).scrollY).toBe(0);
  await reachableFooterControls(page);
  expect(backend.requests.filter((request) => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([]);
});

test('entering and leaving editing recalculates footer height, and closing its settings dialog leaves contacts reachable', async ({ page, backend }) => {
  const initialCatalog = structuredClone(backend.state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/footer-page-not-found');
  await expect(page.locator('main h1')).toBeVisible();
  const publicLayout = await atDocumentEnd(page);
  await backend.signIn(page);
  const footer = page.locator('.site-footer');
  await expect(footer.getByRole('button', { name: 'Configurar web', exact: true })).toBeVisible();
  await atDocumentEnd(page);
  await reachableFooterControls(page);
  await footer.getByRole('button', { name: 'Configurar web', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Configuración general', exact: true });
  await expect(settings).toBeVisible();
  await page.setViewportSize({ width: 390, height: 664 });
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();
  await atDocumentEnd(page);
  await reachableFooterControls(page);
  await footer.getByRole('button', { name: 'Salir de edición', exact: true }).click();
  await expect(footer.getByRole('button', { name: 'Edición web', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const restored = await atDocumentEnd(page);
  expect(Math.abs(restored.footerHeight - publicLayout.footerHeight)).toBeLessThanOrEqual(1);
  expect(restored.scrollY).toBe(0);
  await reachableFooterControls(page);
  expect(backend.requests.filter((request) => {
    const path = new URL(request.url).pathname;
    return path.startsWith('/rest/v1/') && path !== '/rest/v1/rpc/is_admin' && request.method !== 'GET';
  })).toEqual([]);
  expect(backend.state).toEqual(initialCatalog);
  expect(backend.state.uploads).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
});
