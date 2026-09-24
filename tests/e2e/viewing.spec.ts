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

async function measureLanding(page: Page) {
  return page.evaluate(() => {
    const bounds = (element: Element) => {
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const section = document.querySelector('.portfolio-entry-section')!;
    return {
      scrollY, header: bounds(document.querySelector('.site-header')!), section: bounds(section),
      grid: bounds(section.querySelector('.support-landing-grid')!),
      gridGap: Number.parseFloat(getComputedStyle(section.querySelector('.support-landing-grid')!).columnGap),
      gridRowGap: Number.parseFloat(getComputedStyle(section.querySelector('.support-landing-grid')!).rowGap),
      cards: [...section.querySelectorAll('.support-landing-card')].map((card) => ({
        card: bounds(card), image: bounds(card.querySelector('.support-landing-card__image')!),
        title: bounds(card.querySelector('.support-landing-card__title')!),
        imageSource: (card.querySelector('img') as HTMLImageElement).currentSrc,
        imageAlt: card.querySelector('img')!.getAttribute('alt'),
        titleText: card.querySelector('.support-landing-card__title')!.textContent!.trim(),
        href: card.getAttribute('href'),
      })),
    };
  });
}

function previousDesktopLandingSide(width: number, height: number) {
  // Historical shared layout, intentionally independent of the new portfolio CSS:
  // section min(980px, 108svh), page padding clamp(22px, 4vw, 64px),
  // two equal columns separated by clamp(34px, 5vw, 66px).
  const section = Math.min(width, 980, height * 1.08);
  const padding = Math.min(64, Math.max(22, width * .04));
  const gap = Math.min(66, Math.max(34, width * .05));
  return (section - padding * 2 - gap) / 2;
}

const desktopLandingViewports = [
  { width: 1024, height: 768 }, { width: 1280, height: 720 }, { width: 1366, height: 768 },
  { width: 1440, height: 900 }, { width: 1920, height: 1080 }, { width: 1440, height: 600 },
  { width: 2560, height: 720 },
];

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
    if (width <= 820) {
      expect(layout.logoOffset).toBe(0);
      expect(Math.abs(layout.brand.left + layout.brand.width / 2 - width / 2)).toBeLessThan(1);
    } else {
      expect(layout.logoOffset).toBeGreaterThanOrEqual(12);
    }
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

test('home squares and italic quotation retain their layout above a white footer with centered copyright', async ({ page }, testInfo) => {
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
  await expect(footer).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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

test('larger desktop portfolio squares and both titles fit the initial viewport on home and work after fresh loads and resizes', async ({ page }, testInfo) => {
  await spanish(page);
  const layouts: { path: string; phase: string; viewport: typeof desktopLandingViewports[number]; layout: Awaited<ReturnType<typeof measureLanding>> }[] = [];
  for (const path of ['/', '/obra']) {
    for (const phase of ['fresh', 'resize']) {
      for (const viewport of desktopLandingViewports) {
        await page.setViewportSize(viewport);
        if (phase === 'fresh') await page.goto(path);
        const cards = page.locator('.support-landing-card');
        await expect(cards).toHaveCount(2);
        for (const card of await cards.all()) {
          await loadedImage(card.locator('img'));
          await expect(card).toBeInViewport({ ratio: 1 });
          await expect(card.locator('.support-landing-card__title')).toBeInViewport({ ratio: 1 });
        }
        const layout = await measureLanding(page);
        layouts.push({ path, phase, viewport, layout });
        expect(layout.scrollY).toBe(0);
        expect(layout.cards).toHaveLength(2);
        expect(layout.gridGap).toBeGreaterThanOrEqual(34);
        const [first, second] = layout.cards;
        expect(second.image.x - first.image.right).toBeGreaterThanOrEqual(34);
        expect(Math.abs(first.image.y - second.image.y)).toBeLessThan(1);
        expect(Math.abs(first.image.width - second.image.width)).toBeLessThan(1);
        for (const { card, image, title } of layout.cards) {
          expect(Math.abs(image.width - image.height)).toBeLessThan(1);
          expect(image.width).toBeGreaterThan(previousDesktopLandingSide(viewport.width, viewport.height) + 1);
          expect(card.y - layout.header.bottom).toBeGreaterThanOrEqual(18);
          expect(card.x).toBeGreaterThanOrEqual(18);
          expect(card.right).toBeLessThanOrEqual(viewport.width - 18);
          expect(card.bottom).toBeLessThanOrEqual(viewport.height - 18);
          expect(title.y - image.bottom).toBeGreaterThanOrEqual(18);
          expect(title.bottom).toBeLessThanOrEqual(viewport.height - 18);
        }
        await expect(cards.nth(0)).toHaveAttribute('href', '/lienzos');
        await expect(cards.nth(1)).toHaveAttribute('href', '/laminas');
        await expect(cards.nth(0).locator('.support-landing-card__title')).toHaveText('Lienzos');
        await expect(cards.nth(1).locator('.support-landing-card__title')).toHaveText('Obra en papel');
        await expect(page.locator('.home-statement-section')).toHaveCount(1);
        await noOverflow(page);
        if (phase === 'fresh' && [900, 600].includes(viewport.height)) {
          await page.screenshot({ path: testInfo.outputPath(`${path === '/' ? 'home' : 'work'}-squares-${viewport.width}x${viewport.height}.png`) });
        }
      }
    }
  }
  await testInfo.attach('desktop-portfolio-landing-layout', { body: JSON.stringify(layouts, null, 2), contentType: 'application/json' });
});

test('home and work share exactly the same cover content and layout across mobile and desktop viewports', async ({ page }) => {
  await spanish(page);
  for (const viewport of [
    { width: 320, height: 844 }, { width: 390, height: 844 }, { width: 820, height: 844 },
    ...desktopLandingViewports,
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/obra');
    await expect(page.locator('.support-landing-card')).toHaveCount(2);
    for (const card of await page.locator('.support-landing-card').all()) await loadedImage(card.locator('img'));
    await expect(page.locator('.home-statement-section')).toHaveCount(1);
    const work = await measureLanding(page);
    await page.goto('/');
    await expect(page.locator('.support-landing-card')).toHaveCount(2);
    for (const card of await page.locator('.support-landing-card').all()) await loadedImage(card.locator('img'));
    await expect(page.locator('.home-statement-section')).toHaveCount(1);
    const home = await measureLanding(page);
    expect(home.scrollY).toBe(0);
    expect(work.scrollY).toBe(0);
    expect(home.gridGap).toBeCloseTo(work.gridGap, 1);
    expect(home.gridRowGap).toBeCloseTo(work.gridRowGap, 1);
    for (const key of ['section', 'grid'] as const) {
      for (const dimension of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(home[key][dimension] - work[key][dimension])).toBeLessThan(1);
      }
    }
    for (const index of [0, 1]) {
      for (const key of ['imageSource', 'imageAlt', 'titleText', 'href'] as const) {
        expect(home.cards[index][key]).toBe(work.cards[index][key]);
      }
      for (const key of ['card', 'image', 'title'] as const) {
        for (const dimension of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(home.cards[index][key][dimension] - work.cards[index][key][dimension])).toBeLessThan(1);
        }
      }
    }
    await noOverflow(page);
  }
});

test('a single compact white footer preserves centered branding and translated baseline, contact links and comfortable controls at responsive widths', async ({ page, backend }, testInfo) => {
  await spanish(page);
  await page.goto('/');
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  const footer = page.locator('.site-footer');
  const contacts = footer.locator('.site-footer__contact a');
  const editor = footer.getByRole('button', { name: 'Edición web', exact: true });
  const touchPointer = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const measurements: { width: number; footerHeight: number; logoWidth: number; touchPointer: boolean }[] = [];
  const baselineMeasurements: { width: number; language: string; lineCount: number; centers: number[] }[] = [];
  for (const width of [320, 390, 820, 821, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await footer.scrollIntoViewIfNeeded();
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(footer).toHaveCount(1);
    await expect(footer.locator('.site-footer__inner, .site-footer__bottom')).toHaveCount(2);
    await expect(footer.locator('.site-footer__nav')).toHaveCount(0);
    await expect(footer).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(footer).toHaveCSS('background-image', 'none');
    await expect(footer.locator('.site-footer__bottom')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.app-shell')).toHaveCSS('background-image', /linear-gradient/);
    const footerBounds = (await footer.boundingBox())!;
    const logoBounds = (await footer.locator('.toni-crespo-logo').boundingBox())!;
    expect(footerBounds.x).toBeGreaterThanOrEqual(0);
    expect(footerBounds.x + footerBounds.width).toBeLessThanOrEqual(width);
    // Coarse-pointer tablets keep 44px controls even in a desktop layout.
    expect(footerBounds.height).toBeLessThanOrEqual(width <= 820 ? 340 : touchPointer ? 240 : 210);
    expect(logoBounds.width).toBeGreaterThanOrEqual(128);
    expect(logoBounds.width).toBeLessThanOrEqual(160);
    measurements.push({ width, footerHeight: footerBounds.height, logoWidth: logoBounds.width, touchPointer });
    const centers = await footer.locator('.site-footer__logo, .site-footer__brand-block > p, .site-footer__copyright, .site-footer__legal > span').evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return box.x + box.width / 2;
    }));
    expect(centers).toHaveLength(4);
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1);
    await expect(footer.locator('.site-footer__brand-block > p')).toHaveText('Mallorca');
    await expect(footer.locator('.site-footer__copyright')).toHaveText('© 2026 Toni Crespo');
    await expect(contacts).toHaveCount(3);
    await expect(contacts.nth(0)).toHaveAttribute('href', 'mailto:studio@example.test');
    await expect(contacts.nth(1)).toHaveAttribute('href', 'tel:+34600111222');
    await expect(contacts.nth(2)).toHaveAttribute('href', 'https://www.instagram.com/toni.fixture/');
    for (const control of [...await contacts.all(), editor]) {
      await expect(control).toBeVisible();
      const bounds = (await control.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(touchPointer ? 44 : 32);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(footerBounds.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(footerBounds.x + footerBounds.width);
    }
    if (touchPointer) expect((await footer.locator('.site-footer__logo').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    for (const contact of await contacts.all()) await expect(contact).toHaveCSS('font-size', '14px');
    await noOverflow(page);
    for (const [language, baseline] of [
      ['Español', 'Obra original y obra en papel'],
      ['Català', 'Obra original i obra en paper'],
      ['English', 'Original works and works on paper'],
      ['Deutsch', 'Originalwerke und Arbeiten auf Papier'],
    ]) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(page.locator('.site-header')).not.toHaveClass(/site-header--hidden/);
      await page.locator('.header-language__trigger').click();
      await page.getByRole('menuitemradio', { name: new RegExp(`^${language}`) }).click();
      await expect(footer.locator('.site-footer__legal > span')).toHaveText(baseline);
      await footer.scrollIntoViewIfNeeded();
      await expect(footer.locator('.site-footer__legal')).toHaveCSS('text-align', 'center');
      const alignment = await footer.evaluate((element) => {
        const center = (item: Element) => { const box = item.getBoundingClientRect(); return box.left + box.width / 2; };
        const label = element.querySelector('.site-footer__legal > span')!;
        const range = document.createRange();
        range.selectNodeContents(label);
        const lines = [...range.getClientRects()].filter((line) => line.width > 0);
        return {
          centers: [...element.querySelectorAll('.site-footer__logo, .site-footer__brand-block > p, .site-footer__copyright, .site-footer__legal > span')].map(center),
          lineCenters: lines.map((line) => line.left + line.width / 2),
          overflow: element.scrollWidth - element.clientWidth,
        };
      });
      expect(alignment.centers).toHaveLength(4);
      expect(Math.max(...alignment.centers) - Math.min(...alignment.centers)).toBeLessThan(1);
      // Check actual text lines too: a full-width box alone can conceal
      // left-aligned text when a translation wraps onto more than one line.
      expect(alignment.lineCenters.length).toBeGreaterThan(0);
      for (const lineCenter of alignment.lineCenters) expect(Math.abs(lineCenter - alignment.centers[0])).toBeLessThan(1);
      expect(alignment.overflow).toBeLessThanOrEqual(1);
      await noOverflow(page);
      baselineMeasurements.push({ width, language, lineCount: alignment.lineCenters.length, centers: alignment.centers });
    }
    if ([320, 1440].includes(width)) await footer.screenshot({ path: testInfo.outputPath(`footer-${width}.png`) });
  }
  await testInfo.attach('compact-footer-layout', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
  expect(baselineMeasurements.some((measurement) => measurement.lineCount > 1)).toBe(true);
  await testInfo.attach('translated-footer-baseline', { body: JSON.stringify(baselineMeasurements, null, 2), contentType: 'application/json' });
  await editor.focus();
  await expect(editor).toBeFocused();
  await page.keyboard.press('Enter');
  const login = page.getByRole('dialog', { name: 'Inicio de sesión de edición', exact: true });
  await expect(login).toBeVisible();
  await login.getByRole('button', { name: 'Cerrar inicio de sesión', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(login).toBeHidden();
  await expect(footer).toHaveCount(1);
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('home and work quotation keep the phone size and use a proportionate desktop size with the same italic typography', async ({ page }, testInfo) => {
  await spanish(page);
  for (const path of ['/', '/obra']) {
    await page.goto(path);
    const quote = page.locator('.home-statement-section h4').first();
    const attribution = page.locator('.home-statement-section h4').last();
    for (const width of [320, 390, 700, 701, 820, 821, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      const expectedSize = width <= 820 ? 22 : Math.min(22, Math.max(19, width * .015));
      await expect(quote).toHaveCSS('font-size', `${Number(expectedSize.toFixed(4))}px`);
      await expect(quote).toHaveCSS('font-style', /italic|oblique/);
      await expect(quote).toHaveCSS('text-align', 'justify');
      await expect(attribution).toHaveCSS('text-align', 'right');
      const fonts = await page.locator('.home-statement-section h4').evaluateAll((elements) => elements.map((element) => ({
        family: getComputedStyle(element).fontFamily, size: Number.parseFloat(getComputedStyle(element).fontSize),
      })));
      expect(fonts[0].family).toContain('Manrope');
      expect(fonts[1].family).toBe(fonts[0].family);
      expect(fonts[1].size).toBeGreaterThanOrEqual(15);
      expect(fonts[1].size).toBeLessThanOrEqual(18);
      expect(fonts[1].size).toBeLessThan(fonts[0].size);
      if (width <= 700) {
        const box = (await quote.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(30);
        expect(width - box.x - box.width).toBeGreaterThanOrEqual(30);
      }
      await noOverflow(page);
      if ([390, 1440].includes(width)) {
        await page.locator('.home-statement-section').screenshot({ path: testInfo.outputPath(`${path === '/' ? 'home' : 'work'}-statement-${width}.png`) });
      }
    }
  }
});

test('home and work reuse the same translated quotation and reflect updates to the single home record', async ({ page, backend }) => {
  await spanish(page);
  const homeRecord = backend.state.tables.site_pages.find((row) => row.kind === 'home')!;
  homeRecord.translations = {
    en: { html: '<h4>Shared English quotation: "books and light".</h4><h4>Ray Bradbury<br/>Fahrenheit 451</h4>' },
    ca: { html: '<h4>Cita catalana compartida: "llibres i llum".</h4><h4>Ray Bradbury<br/>Fahrenheit 451</h4>' },
    de: { html: '<h4>Gemeinsames deutsches Zitat: „Bücher und Licht“.</h4><h4>Ray Bradbury<br/>Fahrenheit 451</h4>' },
  };
  const expectedQuotes: Record<string, string> = {
    Español: 'Hay más de una forma de quemar un libro.',
    English: 'Shared English quotation: «books and light».',
    Català: 'Cita catalana compartida: «llibres i llum».',
    Deutsch: 'Gemeinsames deutsches Zitat: «Bücher und Licht».',
  };
  await page.goto('/');
  for (const language of ['Español', 'English', 'Català', 'Deutsch']) {
    await page.locator('.header-language__trigger').click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${language}(?:\\s|$)`) }).click();
    const statement = page.locator('.home-statement-section .wp-content');
    await expect(statement).toBeVisible();
    await expect(statement.locator('h4').first()).toContainText(expectedQuotes[language]);
    const homeHtml = await statement.innerHTML();
    await headerNavigation(page, language === 'English' ? 'Work' : language === 'Deutsch' ? 'Werke' : 'Obra');
    await expect(page).toHaveURL(/\/obra$/);
    await expect(statement).toHaveCount(1);
    expect(await statement.innerHTML()).toBe(homeHtml);
    await page.locator('.site-header .brand').click();
    await expect(page).toHaveURL(/\/$/);
  }
  // There is no quote-editing form: simulate a saved update to the existing
  // content record, then verify both routes render it, without creating a copy.
  homeRecord.html = '<h4>Cita revisada: "la memoria del color".</h4><h4>Ray Bradbury<br/>Fahrenheit 451</h4>';
  await page.locator('.header-language__trigger').click();
  await page.getByRole('menuitemradio', { name: /^Español/ }).click();
  await page.reload();
  await expect(page.locator('.home-statement-section h4').first()).toHaveText('Cita revisada: «la memoria del color».');
  await headerNavigation(page, 'Obra');
  await expect(page.locator('.home-statement-section h4').first()).toHaveText('Cita revisada: «la memoria del color».');
  expect(backend.state.tables.site_pages.filter((row) => row.kind === 'home')).toHaveLength(1);
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
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

test('unknown and oversized works do not offer room previews but retain their normal viewer', async ({ page, backend }) => {
  await spanish(page);
  const square = backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!;
  square.dimensions = null;
  const wide = backend.state.tables.artworks.find((row) => row.id === 'artwork-wide')!;
  wide.dimensions = '1000 × 1000 cm';
  await page.goto('/lienzos/horizontes');
  await expect(page.locator('#mar-sereno .artwork-ambient-button')).toHaveCount(0);
  await expect(page.locator('#horizonte-abierto .artwork-ambient-button')).toHaveCount(0);
  await expect(page.locator('.room-mockup-card')).toHaveCount(0);
  await page.locator('#mar-sereno .artwork-showcase__zoom-button').click();
  await loadedImage(page.locator('.artwork-lightbox__stage img'));
  await page.keyboard.press('Escape');
  await expect(page.locator('.artwork-lightbox')).toHaveCount(0);
  await expect(page.locator('.artwork-mockup-lightbox')).toHaveCount(0);
});

test('news combine date, search and category filters, clear them and open images without a card glow', async ({ page, isMobile }) => {
  await spanish(page);
  await page.goto('/noticias');
  const cards = page.locator('.news-card');
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
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

test('artwork contact links use configured destinations, preserve channel hover colors and prepare a native email draft without sending', async ({ page, backend, isMobile }) => {
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
  const emailLink = dialog.getByRole('link', { name: 'Correo', exact: true });
  const email = new URL((await emailLink.getAttribute('href'))!);
  expect(email.protocol).toBe('mailto:');
  expect(decodeURIComponent(email.pathname)).toBe('studio@example.test');
  expect(email.searchParams.get('subject')).toBe('Interés en la obra: Mar sereno');
  expect(email.searchParams.get('body')).toBe('Hola Toni, me interesa esta obra: Mar sereno (Óleo sobre lienzo · 30 × 30 cm). ¿Podrías darme más información?');
  expect(email.hash).toBe('');
  expect([...email.searchParams.keys()].sort()).toEqual(['body', 'subject']);
  await expect(dialog.locator('form, input, textarea')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('header, mobile shortcut and footer expose a plain native mailto link without a form or delivery service', async ({ page, backend }) => {
  await spanish(page);
  await page.goto('/');
  const headerEmail = page.locator('a.header-contact-trigger');
  const mobileEmail = page.locator('.header-mobile-shortcuts a.header-mobile-shortcut[href^="mailto:"]');
  const footerEmail = page.locator('.site-footer__contact a[href^="mailto:"]');
  for (const link of [headerEmail, mobileEmail, footerEmail]) {
    await expect(link).toHaveAttribute('href', 'mailto:studio@example.test');
    const email = new URL((await link.getAttribute('href'))!);
    expect(email.search).toBe('');
    expect(email.hash).toBe('');
  }
  if (await headerEmail.isVisible()) {
    await headerEmail.focus();
    await expect(headerEmail).toBeFocused();
  }
  else {
    await page.locator('.header-menu-trigger').click();
    await expect(mobileEmail).toBeVisible();
    await mobileEmail.focus();
    await expect(mobileEmail).toBeFocused();
    await page.keyboard.press('Escape');
  }
  await expect(footerEmail).toBeVisible();
  await expect(page.locator('.contact-form, .contact-form__honeypot')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('native artwork email preserves localized special characters and cannot turn artwork text into mail headers', async ({ page, backend }) => {
  await spanish(page);
  const artwork = backend.state.tables.artworks.find((row) => row.id === 'artwork-square')!;
  artwork.title = 'Mar & llum? #1 — «Ànima»';
  artwork.technique = 'Óleo & collage\nPigmentos';
  artwork.translations = {
    en: { title: 'Sea & light? #1 — «Soul»', technique: 'Oil & collage\nPigments' },
    de: { title: 'Meer & Licht? #1 — «Seele»', technique: 'Öl & Collage\nPigmente' },
    ca: { title: 'Mar & llum? #1 — «Ànima»', technique: 'Oli & collage\nPigments' },
  };
  await page.goto('/lienzos/horizontes');
  for (const variant of [
    { language: 'Español', title: artwork.title, technique: artwork.technique, subject: 'Interés en la obra', greeting: 'Hola Toni, me interesa esta obra:' },
    { language: 'English', ...artwork.translations.en, subject: 'Interest in artwork', greeting: 'Hello Toni, I am interested in this artwork:' },
    { language: 'Deutsch', ...artwork.translations.de, subject: 'Interesse an dem Werk', greeting: 'Hallo Toni, ich interessiere mich für dieses Werk:' },
    { language: 'Català', ...artwork.translations.ca, subject: "Interès en l'obra", greeting: "Hola Toni, m'interessa aquesta obra:" },
  ]) {
    await page.locator('.header-language__trigger').click();
    await page.getByRole('menuitemradio', { name: new RegExp(`^${variant.language}(?:\\s|$)`) }).click();
    await page.locator('#mar-sereno .artwork-interest-button').click();
    const dialog = page.locator('.contact-dialog');
    const email = new URL((await dialog.locator('a.contact-channel--email').getAttribute('href'))!);
    expect(email.protocol).toBe('mailto:');
    expect(decodeURIComponent(email.pathname)).toBe('studio@example.test');
    expect(email.searchParams.get('subject')).toBe(`${variant.subject}: ${variant.title}`);
    expect(email.searchParams.get('body')).toContain(variant.greeting);
    expect(email.searchParams.get('body')).toContain(variant.title);
    expect(email.searchParams.get('body')).toContain(variant.technique.replace(/\r\n?|\n/g, '\r\n'));
    expect(email.searchParams.get('body')).toContain('30 × 30 cm');
    expect(email.hash).toBe('');
    expect([...email.searchParams.keys()].sort()).toEqual(['body', 'subject']);
    await page.keyboard.press('Escape');
  }
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('missing contact settings use the Eulalia fallback consistently in every email entry point', async ({ page, backend }) => {
  await spanish(page);
  backend.state.tables.site_settings = [];
  await page.goto('/lienzos/horizontes');
  await expect(page.locator('a.header-contact-trigger')).toHaveAttribute('href', 'mailto:eulaliaricart@gmail.com');
  await expect(page.locator('.header-mobile-shortcuts a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:eulaliaricart@gmail.com');
  await expect(page.locator('.site-footer__contact a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:eulaliaricart@gmail.com');
  await page.locator('#mar-sereno .artwork-interest-button').click();
  const email = new URL((await page.locator('.contact-dialog a.contact-channel--email').getAttribute('href'))!);
  expect(decodeURIComponent(email.pathname)).toBe('eulaliaricart@gmail.com');
  expect(email.searchParams.get('subject')).toBe('Interés en la obra: Mar sereno');
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});
