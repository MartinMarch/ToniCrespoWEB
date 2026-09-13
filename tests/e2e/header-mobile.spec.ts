import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../helpers/mock-supabase';

async function measureHeader(page: Page) {
  return page.evaluate(() => {
    const element = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    const rect = (target: HTMLElement) => {
      const box = target.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const header = element('.site-header');
    const brand = element('.site-header .brand');
    const style = getComputedStyle(header);
    return {
      header: rect(header), brand: rect(brand), logo: rect(element('.brand .toni-crespo-logo')),
      socials: rect(element('.header-socials')), nav: rect(element('.main-nav')),
      menu: rect(element('.header-menu-trigger')), panel: rect(element('.header-mobile-panel')),
      hero: rect(element('.support-landing-card')),
      columns: style.gridTemplateColumns.split(' ').map(Number.parseFloat),
      paddingLeft: Number.parseFloat(style.paddingLeft),
      marginStart: Number.parseFloat(getComputedStyle(brand).marginInlineStart),
      marginEnd: Number.parseFloat(getComputedStyle(brand).marginInlineEnd),
      alignment: getComputedStyle(brand).justifySelf,
      controls: [...header.querySelectorAll<HTMLElement>('.header-language__trigger, .header-menu-trigger, .header-contact-trigger')]
        .filter((control) => control.offsetParent !== null).map((control) => ({ name: control.className, ...rect(control) })),
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

type HeaderMeasurement = Awaited<ReturnType<typeof measureHeader>>;

function expectCenteredInFirstColumn(layout: HeaderMeasurement) {
  const expectedCenter = layout.header.x + layout.paddingLeft + layout.columns[0] / 2
    + (layout.marginStart - layout.marginEnd) / 2;
  expect(Math.abs(layout.brand.x + layout.brand.width / 2 - expectedCenter)).toBeLessThan(1);
  expect(layout.alignment).toBe('center');
}

function expectCenteredInViewport(layout: HeaderMeasurement, width: number) {
  expect(Math.abs(layout.brand.x + layout.brand.width / 2 - width / 2)).toBeLessThan(1);
  expect(Math.abs(layout.logo.x + layout.logo.width / 2 - width / 2)).toBeLessThan(1);
  expect(layout.marginStart).toBe(0);
  expect(layout.marginEnd).toBe(0);
  expect(layout.alignment).toBe('center');
}

function expectStable(before: HeaderMeasurement, after: HeaderMeasurement) {
  for (const key of ['header', 'brand', 'logo', 'menu', 'socials', 'hero'] as const) {
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(after[key][dimension] - before[key][dimension]), `${key}.${dimension} must not jump when a menu opens`).toBeLessThan(1);
    }
  }
}

async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap(); else await control.click();
}

for (const width of [320, 360, 390, 430, 520, 521, 768, 820]) {
  test(`mobile header at ${width}px centers its unchanged logo and keeps menu/language controls stable`, async ({ page, backend, isMobile }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.locator('.support-landing-card')).toHaveCount(2);
    const header = page.locator('.site-header');
    const menu = page.locator('.header-menu-trigger');
    const language = page.locator('.header-language__trigger');
    const panel = page.locator('#site-header-panel');
    const closed = await measureHeader(page);
    expect(closed.columns).toHaveLength(3);
    expect(closed.columns[0]).toBe(44);
    expect(closed.columns[2]).toBe(44);
    expectCenteredInViewport(closed, width);
    // This change moves the existing logo; it must not resize its 145px artwork.
    expect(closed.logo.width).toBeCloseTo(145, 1);
    expect(closed.menu.right).toBeLessThanOrEqual(closed.brand.x);
    expect(closed.brand.right).toBeLessThanOrEqual(closed.socials.x);
    expect(closed.socials.right).toBeLessThanOrEqual(width);
    expect(closed.overflow).toBeLessThanOrEqual(1);
    expect(closed.controls).toHaveLength(2);
    for (const control of closed.controls) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(control.x).toBeGreaterThanOrEqual(0);
      expect(control.bottom).toBeLessThanOrEqual(closed.header.bottom);
    }
    await expect(menu).toHaveAttribute('aria-controls', 'site-header-panel');
    await expect(panel).toBeHidden();
    for (const item of await page.locator('.header-socials__item--social, .header-socials__item--email').all()) {
      await expect(item).toBeHidden();
    }
    if ([320, 390].includes(width)) await header.screenshot({ path: testInfo.outputPath(`header-${width}-closed.png`) });

    await activate(menu, isMobile);
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(panel).toHaveCSS('position', 'absolute');
    await expect(page.locator('.main-nav')).toBeVisible();
    const opened = await measureHeader(page);
    await testInfo.attach('header-layout', { body: JSON.stringify({ closed, opened }, null, 2), contentType: 'application/json' });
    if ([320, 390].includes(width)) await header.screenshot({ path: testInfo.outputPath(`header-${width}-opened.png`) });
    expectStable(closed, opened);
    expectCenteredInViewport(opened, width);
    expect(opened.panel.y).toBeGreaterThanOrEqual(opened.header.bottom - 1);
    expect(opened.nav.y).toBeGreaterThanOrEqual(opened.header.bottom - 1);
    await expect(panel.locator('.main-nav a')).toHaveCount(4);
    await expect(panel.locator('.header-mobile-shortcut')).toHaveCount(3);
    for (const link of await panel.locator('.main-nav a, .header-mobile-shortcut').all()) {
      await expect(link).toBeVisible();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    }
    await activate(menu, isMobile);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    expectStable(closed, await measureHeader(page));

    await activate(language, isMobile);
    await expect(page.getByRole('menuitemradio')).toHaveCount(4);
    for (const option of await page.getByRole('menuitemradio').all()) {
      const bounds = (await option.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(48);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expectStable(closed, await measureHeader(page));
    await activate(page.getByRole('menuitemradio', { name: /^English/ }), isMobile);
    await expect(language).toHaveAccessibleName(/English/);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await language.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitemradio', { name: /^Català/ })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitemradio', { name: /^Deutsch/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(language).toHaveAccessibleName(/Deutsch/);
    await expect(language).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    expectStable(closed, await measureHeader(page));
    expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
  });
}

test('mobile menu and language selector are mutually exclusive, dismiss accessibly and close after navigation', async ({ page, backend, isMobile }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  const menu = page.locator('.header-menu-trigger');
  const language = page.locator('.header-language__trigger');
  const panel = page.locator('#site-header-panel');
  const closed = await measureHeader(page);

  await menu.focus();
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await panel.locator('.main-nav a').last().focus();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.site-header .brand')).toBeFocused();
  await page.keyboard.press('Tab');
  for (const control of await panel.locator('.main-nav a, .header-mobile-shortcut').all()) {
    await expect(control).toBeFocused();
    await page.keyboard.press('Tab');
  }
  await expect(language).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.support-landing-card').first()).toBeFocused();
  await expect(panel).toBeHidden();

  await activate(menu, isMobile);
  await activate(language, isMobile);
  await expect(panel).toBeHidden();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('menu')).toBeVisible();
  await activate(menu, isMobile);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(language).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeVisible();

  if (isMobile) await page.touchscreen.tap(4, 820); else await page.mouse.click(4, 820);
  await expect(panel).toBeHidden();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await activate(language, isMobile);
  if (isMobile) await page.touchscreen.tap(4, 820); else await page.mouse.click(4, 820);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(language).toHaveAttribute('aria-expanded', 'false');
  expectStable(closed, await measureHeader(page));

  await activate(menu, isMobile);
  await expect(panel.getByRole('link', { name: 'Instagram', exact: true })).toHaveAttribute('href', 'https://www.instagram.com/toni.fixture/');
  await expect(panel.getByRole('link', { name: 'WhatsApp', exact: true })).toHaveAttribute('href', 'https://wa.me/34600111222');
  await expect(panel.locator('a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:studio@example.test');
  await activate(panel.locator('.main-nav a[href="/fotografia"]'), isMobile);
  await expect(page).toHaveURL(/\/fotografia$/);
  await expect(panel).toBeHidden();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await activate(menu, isMobile);
  await activate(page.locator('.site-header .brand'), isMobile);
  await expect(page).toHaveURL(/\/$/);
  await expect(panel).toBeHidden();
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 820, height: 400 }]) {
  test(`mobile panels stay inside ${viewport.width}×${viewport.height} and keep every contact reachable`, async ({ page, isMobile }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.support-landing-card')).toHaveCount(2);
    const menu = page.locator('.header-menu-trigger');
    const panel = page.locator('#site-header-panel');
    const before = await measureHeader(page);
    await activate(menu, isMobile);
    const opened = await measureHeader(page);
    expectStable(before, opened);
    expect(opened.panel.x).toBeGreaterThanOrEqual(0);
    expect(opened.panel.right).toBeLessThanOrEqual(viewport.width);
    expect(opened.panel.bottom).toBeLessThanOrEqual(viewport.height);
    await expect(panel).toHaveCSS('overflow-y', 'auto');
    for (const control of await panel.locator('.main-nav a, .header-mobile-shortcut').all()) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeInViewport({ ratio: 1 });
      expect(await control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
      })).toBe(true);
    }
    expect(await page.evaluate(() => scrollY)).toBe(0);
    expect((await measureHeader(page)).overflow).toBeLessThanOrEqual(1);
    await activate(page.locator('.header-language__trigger'), isMobile);
    await expect(panel).toBeHidden();
    const languageMenu = page.getByRole('menu');
    await expect(languageMenu).toBeVisible();
    const languageBounds = (await languageMenu.boundingBox())!;
    expect(languageBounds.x).toBeGreaterThanOrEqual(0);
    expect(languageBounds.x + languageBounds.width).toBeLessThanOrEqual(viewport.width);
    expect(languageBounds.y + languageBounds.height).toBeLessThanOrEqual(viewport.height);
    for (const option of await page.getByRole('menuitemradio').all()) {
      await option.scrollIntoViewIfNeeded();
      await expect(option).toBeInViewport({ ratio: 1 });
    }
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}

test('crossing the mobile breakpoint resets open panels without leaving hidden navigation or stale expanded controls', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 820, height: 844 });
  await page.goto('/');
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  const menu = page.locator('.header-menu-trigger');
  const language = page.locator('.header-language__trigger');
  const panel = page.locator('#site-header-panel');
  await activate(menu, isMobile);
  await expect(panel).toBeVisible();
  await page.setViewportSize({ width: 821, height: 844 });
  await expect(menu).toBeHidden();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  // A disappearing mobile control must not retain focus on desktop.
  await expect(page.locator('.site-header .brand')).toBeFocused();
  await expect(panel).toHaveCSS('display', 'contents');
  await expect(page.locator('.main-nav')).toBeVisible();
  await expect(page.locator('.header-mobile-shortcuts')).toBeHidden();
  await activate(language, isMobile);
  await expect(page.getByRole('menu')).toBeVisible();
  await page.setViewportSize({ width: 820, height: 844 });
  await expect(menu).toBeVisible();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(language).toHaveAttribute('aria-expanded', 'false');
  await expect(language).toBeFocused();
  expectCenteredInViewport(await measureHeader(page), 820);
  await activate(language, isMobile);
  await page.setViewportSize({ width: 821, height: 844 });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(language).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.main-nav')).toBeVisible();

  for (const contact of await panel.locator('.header-mobile-shortcut').all()) {
    await page.setViewportSize({ width: 820, height: 844 });
    await expect(menu).toBeVisible();
    await activate(menu, isMobile);
    await contact.focus();
    await expect(contact).toBeFocused();
    await page.setViewportSize({ width: 821, height: 844 });
    await expect(page.locator('.site-header .brand')).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  }

  for (const contact of await page.locator('.header-socials__item--social a, a.header-contact-trigger').all()) {
    await page.setViewportSize({ width: 821, height: 844 });
    await expect(contact).toBeVisible();
    await contact.focus();
    await expect(contact).toBeFocused();
    await page.setViewportSize({ width: 820, height: 844 });
    await expect(menu).toBeFocused();
    await expect(panel).toBeHidden();
  }

  // Responsive focus recovery must not steal focus from the page content.
  const contentLink = page.locator('.support-landing-card').first();
  await contentLink.focus();
  await page.setViewportSize({ width: 821, height: 844 });
  await expect(contentLink).toBeFocused();
  await page.setViewportSize({ width: 820, height: 844 });
  await expect(contentLink).toBeFocused();
});

test('desktop header above 820px retains the original three columns, logo scale and menu-independent placement', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.support-landing-card')).toHaveCount(2);
  for (const width of [821, 1024, 1080, 1081, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    // Existing social buttons animate 46px ↔ 42px at 1080px. Measure their
    // settled layout, not an intermediate frame from changing the viewport.
    await expect(page.locator('.header-socials__item--social a').first()).toHaveCSS('width', width <= 1080 ? '42px' : '46px');
    const before = await measureHeader(page);
    expect(before.columns).toHaveLength(3);
    expect(Math.abs(before.columns[0] - before.columns[2])).toBeLessThan(1);
    expectCenteredInFirstColumn(before);
    const expectedLogoWidth = width <= 1080 ? Math.min(190, Math.max(145, width * .17)) : Math.min(232, Math.max(168, width * .15));
    expect(Math.abs(before.logo.width - expectedLogoWidth)).toBeLessThan(1);
    expect(Math.abs(before.nav.x + before.nav.width / 2 - width / 2)).toBeLessThan(1);
    await expect(page.locator('.header-menu-trigger')).toBeHidden();
    await page.locator('.header-language__trigger').click();
    await expect(page.getByRole('menu')).toBeVisible();
    expectStable(before, await measureHeader(page));
    await page.keyboard.press('Escape');
    expectStable(before, await measureHeader(page));
  }
});
