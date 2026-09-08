import { test, expect } from '../helpers/mock-supabase';

for (const [path, title] of [['/lienzos', 'Llenços'], ['/laminas', 'Obra en paper']]) {
  test(`${title} collection index keeps its title centered on mobile and desktop`, async ({ page, backend, isMobile }, testInfo) => {
    await page.addInitScript(() => localStorage.setItem('toni-crespo-language', 'ca'));
    await page.goto(path);
    const heading = page.locator('.support-page--index .support-page__heading h1');
    const breadcrumbs = page.getByRole('navigation', { name: 'Ruta de navegació' });
    await expect(heading).toHaveText(title);
    await expect(page.locator('.support-collection-preview-card__link').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    for (const width of [320, 390, 520, 700, 701, 821, 1440]) {
      await test.step(`${width}px`, async () => {
        await page.setViewportSize({ width, height: 1000 });
        await expect(heading).toHaveCSS('text-align', 'center');
        const layout = await heading.evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          const text = range.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return {
            textCenter: text.x + text.width / 2,
            headingCenter: box.x + box.width / 2,
            viewportCenter: window.innerWidth / 2,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
          };
        });
        expect(Math.abs(layout.textCenter - layout.headingCenter)).toBeLessThan(1);
        expect(Math.abs(layout.textCenter - layout.viewportCenter)).toBeLessThan(1);
        expect(layout.overflow).toBeLessThanOrEqual(1);
        await expect(breadcrumbs.getByRole('link', { name: 'Obra', exact: true })).toHaveAttribute('href', '/obra');
        await expect(breadcrumbs.locator('[aria-current="page"]')).toHaveText(title);
        await expect(breadcrumbs).toHaveCSS('justify-content', 'center');
        if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${path.slice(1)}-mobile.png`) });
      });
    }

    // The alignment-only change must preserve the existing breadcrumb navigation.
    await page.setViewportSize({ width: 390, height: 844 });
    const workLink = breadcrumbs.getByRole('link', { name: 'Obra', exact: true });
    if (isMobile) await workLink.tap(); else await workLink.click();
    await expect(page).toHaveURL(/\/obra$/);
    await expect(page.locator('.support-landing-card')).toHaveCount(2);
    expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
  });
}
