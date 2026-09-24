import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../helpers/mock-supabase';

async function activate(control: Locator, touch: boolean) {
  if (touch) await control.tap(); else await control.click();
}

async function openSelector(page: Page, touch: boolean) {
  await activate(page.locator('.header-language__trigger'), touch);
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.getByRole('menuitemradio', { checked: true })).toBeFocused();
}

/** Model the problematic Safari focus sequence, not a physical iPhone.
 * Normal WebKit on Linux may focus buttons on tap. Here mousedown deliberately
 * does not focus the target and blurs the previous button before click arrives.
 */
async function simulateNonFocusingButtons(page: Page) {
  await page.evaluate(() => {
    document.documentElement.dataset.simulatedNullBlurs = '0';
    document.addEventListener('focusout', (event) => {
      if (event.relatedTarget === null && event.target instanceof Element && event.target.closest('.header-language')) {
        document.documentElement.dataset.simulatedNullBlurs = String(Number(document.documentElement.dataset.simulatedNullBlurs) + 1);
      }
    }, true);
    document.addEventListener('mousedown', (event) => {
      if (!(event.target instanceof Element) || !event.target.closest('.header-language button:not(:disabled)')) return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }, true);
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test('language selection works with a normal tap or click, persists and retains keyboard navigation', async ({ page, backend, isMobile }) => {
  await page.goto('/');
  const trigger = page.locator('.header-language__trigger');
  await expect(trigger).toHaveAccessibleName(/Català/);
  await openSelector(page, isMobile);
  await activate(page.getByRole('menuitemradio', { name: 'English', exact: true }), isMobile);
  await expect(trigger).toHaveAccessibleName(/English/);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.reload();
  await expect(trigger).toHaveAccessibleName(/English/);

  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Català', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: 'Deutsch', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAccessibleName(/Deutsch/);
  await expect(trigger).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('simulated Safari null-relatedTarget before click does not consume language selection or flag toggle', async ({ page, backend, isMobile }) => {
  await page.goto('/');
  const trigger = page.locator('.header-language__trigger');
  await expect(trigger).toHaveAccessibleName(/Català/);
  await simulateNonFocusingButtons(page);
  await openSelector(page, isMobile);
  await activate(page.getByRole('menuitemradio', { name: 'English', exact: true }), isMobile);
  await expect(trigger).toHaveAccessibleName(/English/);
  await expect(page.getByRole('menu')).toHaveCount(0);
  expect(await page.locator('html').getAttribute('data-simulated-null-blurs')).not.toBe('0');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('toni-crespo-language'))).toBe('en');
  await openSelector(page, isMobile);
  await activate(trigger, isMobile);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
});

test('null blur is not a dismissal but outside taps, Tab out, Escape and switching mobile menus remain dismissals', async ({ page, isMobile }) => {
  await page.goto('/');
  await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Català/);
  await openSelector(page, isMobile);
  await page.getByRole('menuitemradio', { checked: true }).evaluate((element) => (element as HTMLElement).blur());
  await expect(page.getByRole('menu')).toBeVisible();
  if (isMobile) await page.touchscreen.tap(3, 780); else await page.mouse.click(3, 780);
  await expect(page.getByRole('menu')).toHaveCount(0);

  // Tapping a non-focusable empty part of the header also dismisses the list.
  await openSelector(page, isMobile);
  if (isMobile) await page.touchscreen.tap(3, 3); else await page.mouse.click(3, 3);
  await expect(page.getByRole('menu')).toHaveCount(0);

  await openSelector(page, isMobile);
  await page.getByRole('menuitemradio', { name: 'Deutsch', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('.site-header')).not.toContainText('Deutsch');

  // Focus can leave after a null blur too, without another blur from the header.
  await openSelector(page, isMobile);
  await page.getByRole('menuitemradio', { checked: true }).evaluate((element) => (element as HTMLElement).blur());
  await page.locator('main a[href]').first().focus();
  await expect(page.getByRole('menu')).toHaveCount(0);

  await openSelector(page, isMobile);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('.header-language__trigger')).toBeFocused();
  const menu = page.locator('.header-menu-trigger');
  await activate(menu, isMobile);
  await expect(page.locator('#site-header-panel')).toBeVisible();
  await openSelector(page, isMobile);
  await expect(page.locator('#site-header-panel')).toBeHidden();
  await activate(menu, isMobile);
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.locator('#site-header-panel')).toBeVisible();
  await activate(page.locator('.main-nav a[href="/fotografia"]'), isMobile);
  await expect(page).toHaveURL(/\/fotografia$/);
  await expect(page.locator('#site-header-panel')).toBeHidden();
});

test('an administrator can save a default-language star during a simulated Safari null blur without changing the visitor language', async ({ page, backend, isMobile }) => {
  await page.goto('/');
  await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Català/);
  await backend.signIn(page);
  await simulateNonFocusingButtons(page);
  await openSelector(page, isMobile);
  await activate(page.getByRole('menuitem', { name: 'Usar English como idioma predeterminado', exact: true }), isMobile);
  await expect.poll(() => backend.state.tables.site_settings[0].value.defaultLanguage).toBe('en');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Català/);
  await expect(page.getByRole('menuitem', { name: 'Usar English como idioma predeterminado', exact: true })).toBeDisabled();
  await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeFocused();
  await activate(page.getByRole('menuitemradio', { name: 'English', exact: true }), isMobile);
  await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/English/);
  const writes = backend.requests.filter((request) => new URL(request.url).pathname === '/rest/v1/site_settings' && request.method === 'POST');
  expect(writes).toHaveLength(1);
});
