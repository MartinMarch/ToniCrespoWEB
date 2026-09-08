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

function expectStable(before: HeaderMeasurement, after: HeaderMeasurement) {
  for (const key of ['brand', 'logo', 'socials'] as const) {
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
    const closed = await measureHeader(page);
    expect(closed.columns).toHaveLength(2);
    expectCenteredInFirstColumn(closed);
    // This change moves the existing logo; it must not resize its 145px artwork.
    expect(closed.logo.width).toBeCloseTo(145, 1);
    expect(closed.brand.right).toBeLessThanOrEqual(closed.socials.x);
    expect(closed.socials.right).toBeLessThanOrEqual(width);
    expect(closed.overflow).toBeLessThanOrEqual(1);
    for (const control of closed.controls) {
      expect(control.x).toBeGreaterThanOrEqual(closed.brand.right);
      expect(control.bottom).toBeLessThanOrEqual(closed.header.bottom);
    }
    if ([320, 390].includes(width)) await header.screenshot({ path: testInfo.outputPath(`header-${width}-closed.png`) });

    await activate(menu, isMobile);
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.main-nav')).toBeVisible();
    const opened = await measureHeader(page);
    await testInfo.attach('header-layout', { body: JSON.stringify({ closed, opened }, null, 2), contentType: 'application/json' });
    if ([320, 390].includes(width)) await header.screenshot({ path: testInfo.outputPath(`header-${width}-opened.png`) });
    expectStable(closed, opened);
    expectCenteredInFirstColumn(opened);
    expect(opened.nav.y).toBeGreaterThanOrEqual(opened.brand.bottom);
    await activate(menu, isMobile);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    expectStable(closed, await measureHeader(page));

    await activate(language, isMobile);
    await expect(page.getByRole('menuitemradio')).toHaveCount(4);
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
