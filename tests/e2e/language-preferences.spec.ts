import type { Page } from '@playwright/test';
import { test, expect, MOCK_SUPABASE_URL, type MockSupabaseBackend } from '../helpers/mock-supabase';

const storageKey = 'toni-crespo-language';
const loadedColor = '#c5c5c5';

async function deferSettings(page: Page, backend: MockSupabaseBackend, defaultLanguage: string) {
  const settings = backend.state.tables.site_settings[0].value;
  settings.defaultLanguage = defaultLanguage;
  settings.gradient = { startColor: loadedColor, endColor: '#555555' };
  let release = () => {};
  let pendingReads = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.origin === MOCK_SUPABASE_URL && url.pathname === '/rest/v1/site_settings', async (route) => {
    pendingReads += 1;
    await gate;
    await route.fallback();
  });
  return {
    release,
    async waitForRead() { await expect.poll(() => pendingReads).toBeGreaterThan(0); },
    async waitForAppliedSettings() {
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--gradient-start').trim())).toBe(loadedColor);
    },
  };
}

async function chooseWithKeyboard(page: Page, label: string) {
  await page.locator('.header-language__trigger').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('menuitemradio', { name: label }).focus();
  await page.keyboard.press('Enter');
}

for (const choice of [
  { label: 'English', code: 'en', remoteDefault: 'ca' },
  { label: 'Català', code: 'ca', remoteDefault: 'de' },
]) {
  test(`an explicit ${choice.label} choice survives late settings, including selecting the initial language`, async ({ page, backend }) => {
    const settings = await deferSettings(page, backend, choice.remoteDefault);
    try {
      await page.goto('/');
      await settings.waitForRead();
      await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Català/);
      expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();

      await chooseWithKeyboard(page, choice.label);
      await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(new RegExp(choice.label));
      await expect(page.locator('html')).toHaveAttribute('lang', choice.code);
      expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(choice.code);

      settings.release();
      await settings.waitForAppliedSettings();
      await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(new RegExp(choice.label));
      await expect(page.locator('html')).toHaveAttribute('lang', choice.code);
      await page.reload();
      await settings.waitForAppliedSettings();
      await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(new RegExp(choice.label));
      expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(choice.code);
      expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
    } finally {
      settings.release();
    }
  });
}

test('a first-time visitor without an explicit choice still receives the configured default', async ({ page, backend }) => {
  const settings = await deferSettings(page, backend, 'de');
  try {
    await page.goto('/');
    await settings.waitForRead();
    await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Català/);
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull();
    settings.release();
    await settings.waitForAppliedSettings();
    await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/Deutsch/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('de');
    expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
  } finally {
    settings.release();
  }
});

test('an already stored preference remains active while settings load and after they arrive', async ({ page, backend }) => {
  await page.addInitScript((key) => localStorage.setItem(key, 'en'), storageKey);
  const settings = await deferSettings(page, backend, 'de');
  try {
    await page.goto('/');
    await settings.waitForRead();
    await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/English/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    settings.release();
    await settings.waitForAppliedSettings();
    await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(/English/);
    expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('en');
    expect(backend.requests.filter((request) => !['GET', 'HEAD'].includes(request.method))).toEqual([]);
  } finally {
    settings.release();
  }
});
