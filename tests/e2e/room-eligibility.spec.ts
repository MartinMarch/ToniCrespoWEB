import type { Page } from '@playwright/test';
import { test, expect } from '../helpers/mock-supabase';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('toni-crespo-language', 'es'));
});

test('missing and incompatible dimensions hide only the room action, not zoom or contact', async ({ page, backend }) => {
  backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!.dimensions = null;
  backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!.dimensions = '1000 × 1000 cm';
  await page.goto('/lienzos/horizontes');

  for (const slug of ['mar-sereno', 'horizonte-abierto']) {
    const card = page.locator(`#${slug}`);
    await expect(card).toBeVisible();
    await expect(card.locator('.artwork-ambient-button')).toHaveCount(0);
    await card.locator('.artwork-showcase__zoom-button').click();
    await expect(page.locator('.artwork-lightbox__stage img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.artwork-lightbox')).toHaveCount(0);
    await card.locator('.artwork-interest-button').click();
    const contact = page.locator('.contact-dialog');
    await expect(contact).toBeVisible();
    await expect(contact.locator('.contact-channel')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(contact).toHaveCount(0);
  }
  await expect(page.locator('.artwork-mockup-lightbox')).toHaveCount(0);
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toHaveLength(0);
});

test('pixel dimensions and unitless values are not physical sizes, while explicit caption measurements remain usable', async ({ page, backend }) => {
  const square = backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!;
  square.dimensions = '80 × 60';
  square.width = 8000;
  square.height = 6000;
  const wide = backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!;
  wide.dimensions = null;
  wide.caption = 'Óleo sobre lienzo. 80 × 60 cm';
  await page.goto('/lienzos/horizontes');

  await expect(page.locator('#mar-sereno')).toBeVisible();
  await expect(page.locator('#mar-sereno .artwork-ambient-button')).toHaveCount(0);
  await page.locator('#horizonte-abierto .artwork-ambient-button').click();
  const dialog = page.locator('.artwork-mockup-lightbox');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.room-mockup-card').first()).toBeVisible();
  await expect(dialog.locator('.artwork-mockup-lightbox__scale')).toContainText('Escala orientativa');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('editing dimensions immediately updates room eligibility and keeps editorial controls', async ({ page, backend }) => {
  await page.goto('/lienzos/horizontes');
  await backend.signIn(page);
  const card = page.locator('#mar-sereno');
  await expect(card.locator('.artwork-ambient-button')).toBeVisible();

  for (const dimensions of ['', '30 × 30 cm', '1000 × 1000 cm']) {
    await card.getByRole('button', { name: 'Editar obra: Mar sereno', exact: true }).click();
    const editor = page.getByRole('dialog', { name: /^Editar obra de / });
    await editor.getByLabel('Dimensiones', { exact: true }).fill(dimensions);
    await editor.getByRole('button', { name: 'Guardar obra', exact: true }).click();
    await expect(editor).toHaveCount(0);
    await expect(card).toBeVisible();
    await expect(card.locator('.artwork-ambient-button')).toHaveCount(dimensions === '30 × 30 cm' ? 1 : 0);
    await expect(card.getByRole('button', { name: 'Editar obra: Mar sereno', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Ocultar obra: Mar sereno', exact: true })).toBeVisible();
    await expect(card.locator('.artwork-showcase__zoom-button')).toBeVisible();
    await expect(card.locator('.artwork-interest-button')).toBeVisible();
  }
  await expect(page.locator('.artwork-mockup-lightbox')).toHaveCount(0);
});

// A stable React root tests updates while the viewer is open. The production
// page refreshes after a save, so testing only that path could miss stale modal
// state when new data arrives without remounting ArtworkShowcaseList.
const stateFixture = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
await import('/@vite/client');
await import('/src/styles/global.css');
const [reactModule, reactDomModule, { SitePreferencesProvider }, { ContactDialogProvider }, { ArtworkShowcaseList }] = await Promise.all([
  import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
  import('/src/app/sitePreferences.tsx'), import('/src/components/contact/ContactDialogProvider.tsx'),
  import('/src/components/artworks/ArtworkShowcaseList.tsx'),
]);
const React = reactModule.default ?? reactModule;
const { createRoot } = reactDomModule.default ?? reactDomModule;
const root = createRoot(document.getElementById('root'));
const imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#516975"/></svg>');
window.__roomEligibilityTest = { render(dimensions, includeArtwork = true) {
  const artwork = { id: 'live-artwork', collectionSlug: 'fixture', slug: 'live-artwork', title: 'Obra de prueba',
    caption: '', description: '', technique: 'Óleo sobre lienzo', dimensions, width: 400, height: 400,
    imageUrl, sourceImageUrl: imageUrl, thumbnailUrl: null, sortOrder: 0, isPublished: true, isAvailable: true };
  root.render(React.createElement(SitePreferencesProvider, null, React.createElement(ContactDialogProvider, null,
    React.createElement(ArtworkShowcaseList, { artworks: includeArtwork ? [artwork] : [] }))));
} };
window.__roomEligibilityTest.render('30 × 30 cm');
</script></body></html>`;

async function updateOpenArtwork(page: Page, dimensions: string | null, includeArtwork = true) {
  await page.evaluate(({ dimensions, includeArtwork }) => {
    (window as unknown as { __roomEligibilityTest: { render: (dimensions: string | null, includeArtwork: boolean) => void } })
      .__roomEligibilityTest.render(dimensions, includeArtwork);
  }, { dimensions, includeArtwork });
}

test('an open room viewer uses current measurements and closes when its artwork becomes ineligible', async ({ page }, testInfo) => {
  await page.route('**/__rooms-state__', (route) => route.fulfill({ contentType: 'text/html', body: stateFixture }));
  await page.goto('/__rooms-state__');
  const trigger = page.locator('#live-artwork .artwork-ambient-button');
  const dialog = page.locator('.artwork-mockup-lightbox');
  await trigger.click();
  await expect(dialog).toBeVisible();
  const firstSmallScene = await dialog.locator('.room-mockup-card').first().getAttribute('data-room-id');
  await dialog.getByRole('button', { name: 'Ambiente siguiente', exact: true }).click();
  await expect(dialog.locator('.artwork-mockup-pagination__dot').nth(1)).toHaveAttribute('aria-current', 'true');
  await dialog.locator('.artwork-mockup-pagination__dot').nth(1).focus();
  await expect(dialog.locator('.artwork-mockup-pagination__dot').nth(1)).toBeFocused();

  await updateOpenArtwork(page, '90 × 90 cm');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.artwork-dimensions')).toContainText('90 × 90 cm');
  await expect(dialog.locator('.room-mockup-card').first()).not.toHaveAttribute('data-room-id', firstSmallScene!);
  await expect(dialog.locator('.room-mockup-card.is-active')).toHaveCount(1);
  await expect(dialog.locator('.artwork-mockup-pagination__dot').first()).toHaveAttribute('aria-current', 'true');
  const close = dialog.locator('.artwork-lightbox__close');
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.locator('.artwork-mockup-pagination__dot').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  const gallery = dialog.locator('.artwork-mockup-gallery');
  await gallery.focus();
  await updateOpenArtwork(page, '95 × 95 cm');
  await expect(dialog.locator('.artwork-dimensions')).toContainText('95 × 95 cm');
  await expect(gallery).toBeFocused();
  await dialog.getByRole('button', { name: 'Ambiente siguiente', exact: true }).click();
  const previous = dialog.getByRole('button', { name: 'Ambiente anterior', exact: true });
  await expect(previous).toBeEnabled();
  await previous.focus();
  await updateOpenArtwork(page, '90 × 90 cm');
  await expect(previous).toBeDisabled();
  await expect(close).toBeFocused();

  for (const dimensions of [null, '1000 × 1000 cm']) {
    await updateOpenArtwork(page, dimensions);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toHaveCount(0);
    await expect(page.locator('html')).not.toHaveClass(/is-lightbox-open/);
    await expect(page.locator('.artwork-showcase__zoom-button')).toBeVisible();
    await expect(page.locator('.artwork-showcase__zoom-button')).toBeFocused();
    await expect(page.locator('.artwork-interest-button')).toBeVisible();
    await updateOpenArtwork(page, '30 × 30 cm');
    await expect(trigger).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await expect(dialog).toBeVisible();
  }

  await updateOpenArtwork(page, '30 × 30 cm', false);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.artwork-showcase')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveClass(/is-lightbox-open/);
  await expect(page.locator('.artwork-showcase-list')).toBeFocused();
  await updateOpenArtwork(page, '30 × 30 cm');
  await expect(trigger).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('room-eligibility-restored.png') });
});
