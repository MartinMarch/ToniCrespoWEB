import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../helpers/mock-supabase';

async function spanish(page: Page) {
  await page.addInitScript(() => localStorage.setItem('toni-crespo-language', 'es'));
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

async function loadedImage(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
}

async function headerNavigation(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const toggle = page.locator('.header-menu-trigger');
  if (await toggle.isVisible()) await toggle.click();
  await page.locator('.main-nav').getByRole('link', { name, exact: true }).click();
}

test('language flags use the configured default, keyboard navigation and persisted visitor choice', async ({ page, backend }) => {
  await page.goto('/');
  const trigger = page.locator('.header-language__trigger');
  await expect(trigger).toHaveAccessibleName(/Català/);
  await expect(trigger).toHaveText('');
  await expect(trigger.locator('svg')).toHaveCount(1);
  const triggerBox = await trigger.boundingBox();
  expect(triggerBox!.width).toBeGreaterThanOrEqual(44);
  expect(triggerBox!.height).toBeGreaterThanOrEqual(44);
  const flagBox = await trigger.locator('svg').boundingBox();
  expect(Math.abs(flagBox!.width - flagBox!.height)).toBeLessThan(1);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const options = page.getByRole('menuitemradio');
  await expect(options).toHaveCount(4);
  await expect(page.getByRole('menuitemradio', { name: /^Català/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: 'Deutsch', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAccessibleName(/English/);
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(trigger).toHaveAccessibleName(/English/);
  await trigger.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  for (const language of ['Español', 'Deutsch', 'Català']) {
    await trigger.click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${language}`) }).click();
    await expect(trigger).toHaveAccessibleName(new RegExp(language));
    await noOverflow(page);
  }
  backend.state.tables.site_settings[0].value.defaultLanguage = 'de';
  await page.evaluate(() => localStorage.removeItem('toni-crespo-language'));
  await page.reload();
  await expect(trigger).toHaveAccessibleName(/Deutsch/);
  expect(backend.requests.filter((request) => request.method !== 'GET')).toEqual([]);
});

test('real navigation reaches work, paper, photography, news and biography on desktop and touch', async ({ page }) => {
  await spanish(page);
  await page.goto('/');
  await page.locator('.support-landing-card[href="/lienzos"]').click();
  await expect(page).toHaveURL(/\/lienzos$/);
  await expect(page.getByRole('heading', { name: 'Lienzos', exact: true })).toBeVisible();
  await headerNavigation(page, 'Obra');
  await expect(page).toHaveURL(/\/obra$/);
  await page.locator('.support-landing-card[href="/laminas"]').click();
  await expect(page).toHaveURL(/\/laminas$/);
  await page.getByRole('link', { name: /^Memoria en papel,/ }).click();
  await expect(page.getByRole('heading', { name: 'Memoria del papel', exact: true })).toBeVisible();
  for (const [label, path] of [['Fotografía', '/fotografia'], ['Noticias', '/noticias'], ['Trayectoria', '/trayectoria']]) {
    await headerNavigation(page, label);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    await noOverflow(page);
  }
  await page.goto('/una-ruta-inexistente');
  await expect(page.getByRole('heading', { name: 'Pagina no encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver al inicio', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('header and footer retain readable fonts, keyboard access and separate layout columns at responsive breakpoints', async ({ page, isMobile }) => {
  await spanish(page);
  await page.goto('/');
  await loadedImage(page.locator('.support-landing-card').first().locator('img'));
  const widths = isMobile ? [320, 390, 820] : [1024, 1440, 1920];
  for (const width of widths) {
    await page.setViewportSize({ width, height: isMobile ? 844 : 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.site-header')).not.toHaveClass(/site-header--hidden/);
    const layout = await page.evaluate(() => {
      const brand = document.querySelector<HTMLElement>('.site-header .brand')!;
      const socials = document.querySelector<HTMLElement>('.header-socials')!;
      const navigation = document.querySelector<HTMLElement>('.main-nav')!;
      const box = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, height: rect.height }; };
      const font = (selector: string) => getComputedStyle(document.querySelector(selector)!).fontFamily;
      return {
        brand: box(brand), socials: box(socials), nav: box(navigation), navVisible: navigation.offsetParent !== null,
        logoOffset: parseFloat(getComputedStyle(brand).marginInlineStart),
        fonts: [font('.main-nav a'), font('.home-statement-section h4'), font('.site-footer__contact a'), font('.site-footer__editor-actions button')],
        footerColor: getComputedStyle(document.querySelector('.site-footer')!).color,
      };
    });
    expect(layout.brand.left).toBeGreaterThanOrEqual(0);
    expect(layout.brand.right).toBeLessThanOrEqual(layout.socials.left + 1);
    expect(layout.socials.right).toBeLessThanOrEqual(width + 1);
    expect(layout.logoOffset).toBeGreaterThanOrEqual(12);
    if (layout.navVisible) {
      expect(layout.brand.right).toBeLessThanOrEqual(layout.nav.left + 1);
      expect(layout.nav.right).toBeLessThanOrEqual(layout.socials.left + 1);
    }
    expect(layout.fonts.every((font) => font === layout.fonts[0])).toBe(true);
    expect(layout.fonts[0]).toContain('Manrope');
    expect(layout.footerColor).toBe('rgb(0, 0, 0)');
    await expect(page.locator('.site-footer__contact a')).toHaveCount(3);
    await noOverflow(page);
  }
  const editor = page.locator('.site-footer').getByRole('button', { name: 'Edición web', exact: true });
  await page.keyboard.press('Tab');
  await editor.focus();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveCSS('text-decoration-line', 'underline');
  await expect(editor).toHaveCSS('color', 'rgb(0, 0, 0)');
  const button = (await editor.boundingBox())!;
  expect(button.height).toBeGreaterThanOrEqual(24);
});

test('home squares, italic quotation, centered copyright and continuous footer gradient', async ({ page }, testInfo) => {
  await spanish(page);
  await page.goto('/');
  const covers = page.locator('.support-landing-card__image');
  await expect(covers).toHaveCount(2);
  await loadedImage(covers.first().locator('img'));
  const first = (await covers.nth(0).boundingBox())!;
  const second = (await covers.nth(1).boundingBox())!;
  expect(Math.abs(first.width - first.height)).toBeLessThan(1);
  expect(Math.abs(first.width - second.width)).toBeLessThan(1);
  const quote = page.locator('.home-statement-section h4').first();
  await expect(quote).toHaveCSS('font-style', /italic|oblique/);
  await expect(quote).toHaveCSS('text-align', 'justify');
  expect(await quote.evaluate((element) => getComputedStyle(element, '::before').content)).toBe('\"\\\"\"');
  expect(await quote.evaluate((element) => getComputedStyle(element, '::after').content)).toBe('\"\\\"\"');
  await expect(page.locator('.home-statement-section h4').last()).toHaveCSS('text-align', 'right');
  const footer = page.locator('.site-footer');
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(footer).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.site-footer__bottom')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.app-shell')).toHaveCSS('background-image', /linear-gradient/);
  const centers = await page.locator('.site-footer__logo, .site-footer__brand-block > p, .site-footer__copyright').evaluateAll((elements) => elements.map((element) => { const box = element.getBoundingClientRect(); return box.x + box.width / 2; }));
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
  await expect(footer.getByRole('link', { name: 'studio@example.test', exact: true })).toHaveAttribute('href', 'mailto:studio@example.test');
  await expect(footer.getByRole('link', { name: '+34 600 111 222', exact: true })).toHaveAttribute('href', 'tel:+34600111222');
  await expect(footer.getByRole('button', { name: 'Edición web', exact: true })).toBeVisible();
  await noOverflow(page);
  if (testInfo.project.name.includes('mobile')) {
    await page.setViewportSize({ width: 320, height: 568 });
    await noOverflow(page);
    const quoteBox = (await quote.boundingBox())!;
    expect(quoteBox.x).toBeGreaterThanOrEqual(24);
    expect(320 - quoteBox.x - quoteBox.width).toBeGreaterThanOrEqual(24);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.site-header')).not.toHaveClass(/site-header--hidden/);
  await page.screenshot({ path: testInfo.outputPath('home-footer.png'), fullPage: true });
});

test('collections have dynamic frameless previews and a genuine empty state without overlapping neighboring cards', async ({ page, isMobile }) => {
  await spanish(page);
  await page.goto('/lienzos');
  const populated = page.getByRole('link', { name: 'Horizontes, 2 obras', exact: true });
  const empty = page.getByRole('link', { name: 'Colección vacía, Colección sin obras', exact: true });
  await expect(populated.locator('.support-collection-preview-card__artwork')).toHaveCount(2);
  await expect(empty.locator('.support-collection-preview-card__artwork')).toHaveCount(0);
  await expect(empty.locator('.support-collection-preview-card__empty')).toBeVisible();
  const artwork = populated.locator('.support-collection-preview-card__artwork').first();
  await expect(artwork).toHaveCSS('border-top-width', '0px');
  if (isMobile) {
    await populated.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect(populated).toHaveClass(/is-touching/);
    await populated.dispatchEvent('pointercancel', { pointerType: 'touch' });
    await expect(populated).not.toHaveClass(/is-touching/);
  } else {
    await populated.hover();
  }
  const bounds = await page.locator('.support-collection-preview-card').evaluateAll((cards) => cards.map((card) => { const b = card.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; }));
  expect(bounds[0].right <= bounds[1].left + 1 || bounds[0].bottom <= bounds[1].top + 1).toBe(true);
  if (isMobile) await populated.tap(); else await populated.click();
  await expect(page).toHaveURL(/\/lienzos\/horizontes$/);
  await expect(page.locator('article.artwork-showcase')).toHaveCount(2);
  await expect(page.getByText('Obra reservada', { exact: true })).toHaveCount(0);
  await page.goto('/lienzos/coleccion-vacia');
  await expect(page.getByRole('heading', { name: 'Colección vacía', exact: true })).toBeVisible();
  await expect(page.locator('article.artwork-showcase')).toHaveCount(0);
  await noOverflow(page);
});

test('artwork metadata aligns beneath the image, preserves text and changes units without changing artwork size', async ({ page }) => {
  await spanish(page);
  await page.goto('/lienzos/horizontes');
  const card = page.locator('#mar-sereno');
  await loadedImage(card.locator('.artwork-showcase__figure img'));
  await expect(card.getByRole('heading', { name: 'Mar sereno', exact: true })).toBeVisible();
  await expect(card.locator('.artwork-editorial__description')).toContainText('Pigmentos y recuerdos del mar.');
  await expect(card.locator('.artwork-editorial__description')).toHaveCSS('white-space', 'pre-line');
  const figure = (await card.locator('figure').boundingBox())!;
  const metadata = (await card.locator('.artwork-showcase__meta').boundingBox())!;
  expect(Math.abs(figure.x - metadata.x)).toBeLessThan(1);
  expect(Math.abs(figure.width - metadata.width)).toBeLessThan(1);
  expect(metadata.y - figure.y - figure.height).toBeGreaterThanOrEqual(12);
  await card.getByRole('button', { name: 'Mostrar en pulgadas', exact: true }).click();
  await expect(card.locator('.artwork-dimensions > span')).toHaveText('11,8 × 11,8 in');
  expect((await card.locator('figure').boundingBox())!.width).toBeCloseTo(figure.width, 1);
  await card.getByRole('button', { name: 'Mostrar en centímetros', exact: true }).click();
  await expect(card.locator('.artwork-dimensions > span')).toHaveText('30 × 30 cm');
  await card.getByRole('button', { name: 'Ver a pantalla completa: Mar sereno', exact: true }).click();
  await loadedImage(page.locator('.artwork-lightbox__stage img'));
  await expect(page.locator('.artwork-lightbox__caption')).toContainText('Mar sereno');
  await page.keyboard.press('Escape');
  await expect(page.locator('.artwork-lightbox')).toHaveCount(0);
  await noOverflow(page);
});

test('AI rooms keep calibrated physical scale, contain the whole frameless work and provide accessible navigation', async ({ page, backend, isMobile }, testInfo) => {
  await spanish(page);
  await page.goto('/lienzos/horizontes');
  for (const slug of ['mar-sereno', 'horizonte-abierto']) {
    const row = backend.state.tables.artworks.find((artwork) => artwork.slug === slug)!;
    const trigger = page.locator(`#${slug} .artwork-ambient-button`);
    await trigger.click();
    const dialog = page.locator('.artwork-mockup-lightbox');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.artwork-mockup-lightbox__scale')).toContainText('Escala orientativa');
    await loadedImage(dialog.locator('.room-mockup-card.is-active img.room-mockup-card__background'));
    const geometry = await page.evaluate(async (artwork) => {
      const catalogPath = '/src/data/roomScenes.ts';
      const geometryPath = '/src/lib/artworkRoomGeometry.ts';
      const { roomScenes } = await import(catalogPath);
      const { getArtworkMetrics, getArtworkPlacement, getMockupsForArtwork } = await import(geometryPath);
      const metrics = getArtworkMetrics(artwork);
      const expectedScenes = getMockupsForArtwork(artwork, roomScenes);
      const cards = [...document.querySelectorAll<HTMLElement>('.room-mockup-card')];
      return { expectedCount: expectedScenes.length, cards: cards.map((card) => {
        const scene = roomScenes.find((candidate: { id: string }) => candidate.id === card.dataset.roomId);
        const expected = getArtworkPlacement(metrics, scene);
        const room = card.getBoundingClientRect();
        const surface = card.querySelector<HTMLElement>('.room-mockup-card__artwork')!;
        const image = surface.querySelector('img')!;
        const art = surface.getBoundingClientRect();
        return { fits: expected.fits, estimated: expected.isEstimated, expectedWidth: expected.width, expectedHeight: expected.height, width: art.width / room.width * 100, height: art.height / room.height * 100, ratio: art.width / art.height, expectedRatio: metrics.ratio, roomRatio: room.width / room.height, border: getComputedStyle(surface).borderTopWidth, objectFit: getComputedStyle(image).objectFit, inside: art.left >= room.left && art.right <= room.right && art.top >= room.top && art.bottom <= room.bottom };
      }) };
    }, { dimensions: row.dimensions, description: row.description, caption: row.caption, width: row.width, height: row.height });
    expect(geometry.cards.length).toBe(geometry.expectedCount);
    for (const placement of geometry.cards) {
      expect(placement.fits).toBe(true);
      expect(placement.estimated).toBe(false);
      expect(placement.inside).toBe(true);
      expect(placement.width).toBeCloseTo(placement.expectedWidth, 1);
      expect(placement.height).toBeCloseTo(placement.expectedHeight, 1);
      expect(placement.ratio).toBeCloseTo(placement.expectedRatio, 1);
      expect(placement.roomRatio).toBeCloseTo(1.5, 2);
      expect(placement.border).toBe('0px');
      expect(placement.objectFit).toBe('contain');
    }
    const dots = dialog.locator('.artwork-mockup-pagination__dot');
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    await dialog.getByRole('button', { name: 'Ambiente siguiente', exact: true }).click();
    await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
    await dialog.locator('.artwork-mockup-gallery').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(dots.first()).toHaveAttribute('aria-current', 'true');
    await dots.last().click();
    await expect(dots.last()).toHaveAttribute('aria-current', 'true');
    await expect(dialog.locator('.room-mockup-card.is-active')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const before = (await dialog.locator('.room-mockup-card.is-active .room-mockup-card__artwork').boundingBox())!;
    await dialog.getByRole('button', { name: 'Mostrar en pulgadas', exact: true }).click();
    expect((await dialog.locator('.room-mockup-card.is-active .room-mockup-card__artwork').boundingBox())!.width).toBeCloseTo(before.width, 1);
    await dialog.getByRole('button', { name: 'Mostrar en centímetros', exact: true }).click();
    if (isMobile) {
      for (const control of await dialog.locator('.artwork-mockup-nav:not(:disabled), .artwork-mockup-pagination__dot, .artwork-dimensions__toggle').all()) {
        const box = (await control.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      // Native touch scrolling, not a programmatic change to carousel state.
      const galleryBox = (await dialog.locator('.artwork-mockup-gallery').boundingBox())!;
      const client = await page.context().newCDPSession(page);
      const touchY = galleryBox.y + galleryBox.height / 2;
      const touchStart = galleryBox.x + galleryBox.width * .2;
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchStart, y: touchY }] });
      for (let step = 1; step <= 8; step++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchStart + galleryBox.width * .6 * step / 8, y: touchY }] });
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await client.detach();
      await expect(dots.last()).not.toHaveAttribute('aria-current', 'true');
      await expect(dialog.locator('.room-mockup-card.is-active')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
      await page.setViewportSize({ width: 667, height: 375 });
      await expect.poll(() => dialog.locator('.room-mockup-card.is-active').evaluate((card) => {
        const room = card.getBoundingClientRect();
        const gallery = card.parentElement!.getBoundingClientRect();
        return Math.abs(room.x + room.width / 2 - gallery.x - gallery.width / 2);
      }), { message: 'Rotating the phone must retain the active room centered' }).toBeLessThan(2);
      const scaleBox = (await dialog.locator('.artwork-mockup-lightbox__scale').boundingBox())!;
      expect(scaleBox.y + scaleBox.height).toBeLessThanOrEqual(376);
      await page.screenshot({ path: testInfo.outputPath(`rooms-${slug}-landscape.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await page.screenshot({ path: testInfo.outputPath(`rooms-${slug}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('unknown room dimensions are explicitly unscaled and oversized works are never shrunk to fit', async ({ page, backend }) => {
  await spanish(page);
  const square = backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!;
  square.dimensions = null;
  const wide = backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!;
  wide.dimensions = '1000 × 1000 cm';
  await page.goto('/lienzos/horizontes');
  await page.locator('#mar-sereno .artwork-ambient-button').click();
  await expect(page.locator('.artwork-mockup-lightbox__scale')).toContainText('Vista sin escala');
  await page.keyboard.press('Escape');
  await page.locator('#horizonte-abierto .artwork-ambient-button').click();
  await expect(page.locator('.artwork-mockup-empty')).toContainText('No la reducimos para que encaje');
  await expect(page.locator('.room-mockup-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar ambientes', exact: true }).click();
  await expect(page.locator('.artwork-mockup-lightbox')).toHaveCount(0);
});

test('news combine date, search and category filters, clear them and open images without a card glow', async ({ page, isMobile }) => {
  await spanish(page);
  await page.goto('/noticias');
  const cards = page.locator('.news-card');
  await expect(cards).toHaveCount(2);
  await page.getByLabel('Desde', { exact: true }).fill('2026-01-01');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Exposición de primavera');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-05-01');
  await expect(page.getByText('No hay noticias que coincidan con la búsqueda.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await page.getByRole('combobox', { name: /^Categoría/ }).selectOption('entrevista');
  await page.getByRole('searchbox', { name: 'Buscar', exact: true }).fill('pigmentos');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Entrevista en el taller');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveCSS('box-shadow', 'none');
  if (!isMobile) {
    await cards.first().hover();
    await expect(cards.first()).toHaveCSS('box-shadow', 'none');
  }
  await cards.first().getByRole('link').focus();
  await expect(cards.first()).toHaveCSS('box-shadow', 'none');
  await expect(cards.first().getByRole('link')).toHaveAttribute('href', 'https://example.test/exposicion');
  await cards.first().locator('.news-card__zoom-button').click();
  await loadedImage(page.locator('.photo-lightbox img'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-lightbox')).toHaveCount(0);
  await noOverflow(page);
});

test('biography centers the primary portrait and renders the poem in italic before the secondary photo', async ({ page }, testInfo) => {
  await spanish(page);
  await page.goto('/trayectoria');
  const main = page.locator('.biography-portrait--main');
  const secondary = page.locator('.biography-portrait--secondary');
  await loadedImage(main.locator('img'));
  await loadedImage(secondary.locator('img'));
  const poem = page.locator('.biography-poem__body');
  await expect(poem).toContainText('Tras el caos de los pigmentos');
  await expect(poem).toHaveCSS('font-style', 'italic');
  await expect(poem).toHaveCSS('white-space', 'pre-line');
  await expect(poem).toHaveCSS('text-align', 'justify');
  await expect(page.locator('.biography-poem__author')).toHaveText('Martin March');
  await expect(page.locator('.biography-poem__author')).toHaveCSS('font-style', 'normal');
  const portraitBox = (await main.boundingBox())!;
  expect(Math.abs(portraitBox.x + portraitBox.width / 2 - page.viewportSize()!.width / 2)).toBeLessThan(2);
  const poemBox = (await poem.boundingBox())!;
  expect((await secondary.boundingBox())!.y).toBeGreaterThan(poemBox.y + poemBox.height);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('biography.png'), fullPage: true });
});

test('photography opens its real image viewer and closes on Escape', async ({ page }) => {
  await spanish(page);
  await page.goto('/fotografia');
  await page.getByRole('button', { name: 'Ver a pantalla completa: Luz de Mallorca', exact: true }).click();
  await loadedImage(page.locator('.photo-lightbox img'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-lightbox')).toHaveCount(0);
  await noOverflow(page);
});

test('artwork contact links use configured destinations, share header hover colors and submit only to the local mock', async ({ page, backend, isMobile }) => {
  await spanish(page);
  await page.goto('/lienzos/horizontes');
  await page.locator('#mar-sereno .artwork-interest-button').click();
  const dialog = page.getByRole('dialog', { name: 'Contactar por la obra: Mar sereno', exact: true });
  await expect(dialog.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', /^https:\/\/wa.me\/34600111222\?text=/);
  const whatsapp = new URL((await dialog.getByRole('link', { name: 'WhatsApp', exact: true }).getAttribute('href'))!);
  expect(whatsapp.searchParams.get('text')).toContain('Mar sereno');
  await expect(dialog.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', 'https://ig.me/m/toni.fixture');
  for (const channel of ['whatsapp', 'instagram', 'email']) {
    const button = dialog.locator(`.contact-channel--${channel}`);
    const colors = await button.evaluate((element, social) => {
      const pseudo = getComputedStyle(element, '::before');
      const header = getComputedStyle(document.querySelector(`[data-social="${social}"] .filled`)!);
      return { channel: pseudo.backgroundImage === 'none' ? pseudo.backgroundColor : pseudo.backgroundImage, header: header.backgroundImage === 'none' ? header.backgroundColor : header.backgroundImage, duration: pseudo.transitionDuration };
    }, channel);
    expect(colors.channel).toBe(colors.header);
    expect(colors.duration).toBe('0.3s');
    if (!isMobile) await button.hover(); else {
      await page.keyboard.press('Tab');
      await button.focus();
    }
    await expect(button).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect.poll(() => button.evaluate((element) => parseFloat(getComputedStyle(element, '::before').height) / element.getBoundingClientRect().height)).toBeGreaterThan(.9);
  }
  await dialog.getByRole('button', { name: 'Correo', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'Enviar un correo', exact: true });
  await expect(composer.getByLabel('Asunto', { exact: true })).toHaveValue('Interés en la obra: Mar sereno');
  await expect(composer.getByRole('textbox', { name: /^Mensaje/ })).toHaveValue(/Mar sereno/);
  await composer.getByLabel('Nombre', { exact: true }).fill('Visitante de prueba');
  await composer.getByLabel('Tu correo electrónico', { exact: true }).fill('visitor@example.test');
  await composer.getByRole('button', { name: 'Enviar correo', exact: true }).click();
  await expect(composer.getByText('Correo enviado. Toni responderá a la dirección indicada.', { exact: true })).toBeVisible();
  expect(backend.state.emails).toHaveLength(1);
  expect(backend.state.emails[0].artwork.title).toBe('Mar sereno');
  expect(backend.state.emails[0].senderEmail).toBe('visitor@example.test');
  await composer.locator('.admin-secondary-button').click();
  await expect(composer).toHaveCount(0);
});

test('contact composer reports a simulated delivery error and allows retry without losing the draft', async ({ page, backend }) => {
  await spanish(page);
  await page.goto('/');
  const headerEmail = page.locator('.header-contact-trigger');
  if (await headerEmail.isVisible()) await headerEmail.click();
  else {
    await page.locator('.header-menu-trigger').click();
    await page.locator('.header-mobile-shortcuts').getByRole('button', { name: 'Correo', exact: true }).click();
  }
  const composer = page.getByRole('dialog', { name: 'Enviar un correo', exact: true });
  await composer.getByLabel('Tu correo electrónico', { exact: true }).fill('visitor@example.test');
  await composer.getByRole('textbox', { name: /^Mensaje/ }).fill('Consulta de prueba sin entrega externa.');
  backend.failNext({ path: '/functions/v1/send-contact-email', method: 'POST', status: 503 });
  await composer.getByRole('button', { name: 'Enviar correo', exact: true }).click();
  await expect(composer.getByRole('alert')).toContainText('No se pudo enviar el correo');
  await expect(composer.getByRole('textbox', { name: /^Mensaje/ })).toHaveValue('Consulta de prueba sin entrega externa.');
  expect(backend.state.emails).toHaveLength(0);
  await composer.getByRole('button', { name: 'Enviar correo', exact: true }).click();
  await expect(composer.getByText('Correo enviado. Toni responderá a la dirección indicada.', { exact: true })).toBeVisible();
  expect(backend.state.emails).toHaveLength(1);
});
