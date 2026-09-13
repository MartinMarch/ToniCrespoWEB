import type { Locator, Page } from '@playwright/test';
import { test, expect, type MockSupabaseBackend } from '../helpers/mock-supabase';

// Real forms, services, routes and localization; only Auth/REST/Storage are mocked.
// These descriptions never leave the isolated Playwright backend.
const locales = [
  { code: 'es', tab: 'ES', name: 'Español', text: 'Paisajes de una memoria compartida.\nLuz y materia en el taller.\n\nUn segundo párrafo para acompañar las obras.' },
  { code: 'ca', tab: 'CA', name: 'Català', text: 'Paisatges d’una memòria compartida.\nLlum i matèria al taller.\n\nUn segon paràgraf per acompanyar les obres.' },
  { code: 'en', tab: 'EN', name: 'English', text: 'Landscapes of a shared memory.\nLight and matter in the studio.\n\nA second paragraph to accompany the works.' },
  { code: 'de', tab: 'DE', name: 'Deutsch', text: 'Landschaften einer gemeinsamen Erinnerung.\nLicht und Materie im Atelier.\n\nEin zweiter Absatz begleitet die Werke.' },
] as const;

const collections = [
  { id: 'collection-canvas', branch: 'Lienzos', path: '/lienzos/horizontes', slug: 'horizontes', recent: false },
  { id: 'collection-paper', branch: 'Obra en papel', path: '/laminas/papel', slug: 'papel', recent: false },
  { id: 'collection-recent-canvas', branch: 'Lienzos', path: '/lienzos/obras-recientes-lienzos', slug: 'obras-recientes-lienzos', recent: true },
  { id: 'collection-recent-paper', branch: 'Obra en papel', path: '/laminas/obras-recientes-papel', slug: 'obras-recientes-papel', recent: true },
] as const;

test.beforeEach(async ({ page, backend }) => {
  backend.enableContentManagerFixture();
  await page.addInitScript(() => {
    if (!localStorage.getItem('toni-crespo-language')) localStorage.setItem('toni-crespo-language', 'es');
  });
});

function writes(backend: MockSupabaseBackend) {
  return backend.requests.filter((request) => new URL(request.url).pathname.startsWith('/rest/v1/')
    && !new URL(request.url).pathname.endsWith('/rpc/is_admin') && !['GET', 'HEAD'].includes(request.method));
}

async function openManager(page: Page, backend: MockSupabaseBackend) {
  await page.goto('/');
  await backend.signIn(page);
  await page.getByRole('button', { name: 'Configurar web', exact: true }).click();
  await page.getByRole('dialog', { name: 'Configuración general', exact: true })
    .getByRole('button', { name: 'Administrar contenido', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestor de contenido', exact: true })).toBeVisible();
}

async function editCollection(page: Page, backend: MockSupabaseBackend, target: typeof collections[number]) {
  await page.getByRole('button', { name: target.branch, exact: true }).click();
  const pane = page.locator('.organizer-pane').first();
  await pane.getByRole('combobox').selectOption(target.id);
  const row = backend.state.tables.collections.find((collection) => collection.id === target.id)!;
  await pane.getByRole('button', { name: `Gestionar colección ${row.title}`, exact: true }).click();
  await page.getByRole('dialog', { name: 'Gestionar colección', exact: true })
    .getByRole('button', { name: target.recent ? 'Editar descripción' : 'Editar colección', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: target.recent ? /^Editar descripción de / : /^Editar colección de / });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectEditorLocale(dialog: Locator, shortLabel: string) {
  await dialog.getByRole('tab').filter({ has: dialog.page().locator('span', { hasText: new RegExp(`^${shortLabel}$`) }) }).click();
}

async function showPublicSite(page: Page) {
  await page.getByRole('button', { name: 'Volver a la web', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
}

async function selectPublicLocale(page: Page, name: typeof locales[number]['name']) {
  await page.locator('.header-language__trigger').click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${name}(?:\\s|$)`) }).click();
  await expect(page.locator('.header-language__trigger')).toHaveAccessibleName(new RegExp(name));
}

async function expectDescription(page: Page | Locator, value: string, alignment: 'justify' | 'center' = 'justify') {
  const description = page.locator('.collection-description');
  await expect(description).toHaveCount(1);
  await expect(description).toBeVisible();
  await expect(description.locator('p')).toHaveText(value.split('\n\n'));
  expect(await description.locator('p').evaluateAll((paragraphs) => paragraphs.map((paragraph) => paragraph.textContent))).toEqual(value.split('\n\n'));
  await expect(description.locator('p').first()).toHaveCSS('white-space', /pre-line|pre-wrap/);
  await expect(description.locator('p').first()).toHaveCSS('text-align', alignment);
}

async function expectIndexDescription(page: Page, path: string, value: string, alignment: 'justify' | 'center' = 'justify') {
  const card = page.locator(`.support-collection-preview-card__link[href="${path}"]`);
  await expectDescription(card, value, alignment);
  const placement = await card.evaluate((element) => {
    const title = element.querySelector('.support-collection-preview-card__title')!;
    const description = element.querySelector('.collection-description')!;
    const count = element.querySelector('.support-collection-preview-card__count');
    const descriptionBox = description.getBoundingClientRect();
    return {
      immediateSibling: title.nextElementSibling === description,
      titleBottom: title.getBoundingClientRect().bottom,
      descriptionTop: descriptionBox.top,
      descriptionBottom: descriptionBox.bottom,
      countTop: count?.getBoundingClientRect().top,
      clipping: description.scrollHeight - description.clientHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  expect(placement.immediateSibling).toBe(true);
  expect(placement.descriptionTop).toBeGreaterThanOrEqual(placement.titleBottom);
  if (placement.countTop !== undefined) expect(placement.countTop).toBeGreaterThanOrEqual(placement.descriptionBottom);
  expect(placement.clipping).toBeLessThanOrEqual(1);
  expect(placement.overflow).toBeLessThanOrEqual(1);
  return card;
}

for (const target of collections) {
  test(`${target.id}: CMS description appears below the collection index title and on both detail routes in all four languages after reload`, async ({ page, backend }) => {
    const original = structuredClone(backend.state.tables.collections.find((row) => row.id === target.id)!);
    const originalArtworks = structuredClone(backend.state.tables.artworks);
    await openManager(page, backend);
    const dialog = await editCollection(page, backend, target);
    for (const locale of locales) {
      await selectEditorLocale(dialog, locale.tab);
      if (target.recent) await expect(dialog.getByLabel('Nombre', { exact: true })).toBeDisabled();
      await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(locale.text);
    }
    await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = backend.state.tables.collections.find((row) => row.id === target.id)!;
    expect(saved.description).toBe(locales[0].text);
    for (const locale of locales.slice(1)) expect(saved.translations[locale.code].description).toBe(locale.text);
    expect(saved.title).toBe(original.title);
    expect(saved.slug).toBe(original.slug);
    if (target.recent) {
      expect(saved.is_recent).toBe(true);
      for (const locale of Object.keys(original.translations)) expect(saved.translations[locale].title).toBe(original.translations[locale].title);
    }
    expect(backend.state.tables.artworks).toEqual(originalArtworks);
    await showPublicSite(page);
    const completedWrites = writes(backend).length;
    for (const locale of locales) {
      await page.goto(target.path);
      await selectPublicLocale(page, locale.name);
      await expectDescription(page, locale.text);
      await page.reload();
      await expectDescription(page, locale.text);
      await page.goto(`/obra/${target.slug}`);
      await expectDescription(page, locale.text);
      await page.reload();
      await expectDescription(page, locale.text);
      const visibleArtworks = originalArtworks.filter((row) => row.collection_id === target.id && row.is_published);
      await expect(page.locator('article.artwork-showcase')).toHaveCount(visibleArtworks.length);
      await page.goto(target.path.slice(0, target.path.lastIndexOf('/')));
      await expectIndexDescription(page, target.path, locale.text);
      await page.reload();
      await expectIndexDescription(page, target.path, locale.text);
    }
    expect(writes(backend)).toHaveLength(completedWrites);
    expect(backend.state.uploads).toEqual([]);
    expect(backend.state.deletedAssets).toEqual([]);
  });
}

for (const target of [collections[0], collections[3]]) {
  test(`${target.id}: centered alignment previews immediately and persists across the index, detail, editor and every language`, async ({ page, backend }) => {
    const row = backend.state.tables.collections.find((collection) => collection.id === target.id)!;
    row.description = locales[0].text;
    for (const locale of locales.slice(1)) row.translations[locale.code] = { ...row.translations[locale.code], description: locale.text };
    const original = structuredClone(row);
    const artworks = structuredClone(backend.state.tables.artworks);
    await openManager(page, backend);
    let dialog = await editCollection(page, backend, target);
    const alignment = dialog.getByRole('group', { name: 'Alineación de la descripción', exact: true });
    await expect(alignment.getByRole('radio', { name: 'Justificada', exact: true })).toBeChecked();
    const preview = dialog.getByRole('region', { name: 'Vista previa de la descripción', exact: true });
    await expectDescription(preview, locales[0].text);
    await alignment.getByRole('radio', { name: 'Justificada', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(alignment.getByRole('radio', { name: 'Centrada', exact: true })).toBeChecked();
    await expectDescription(preview, locales[0].text, 'center');
    expect(writes(backend)).toEqual([]);
    for (const locale of locales) {
      await selectEditorLocale(dialog, locale.tab);
      await expect(dialog.getByRole('textbox', { name: /^Descripción/ })).toHaveValue(locale.text);
      await expectDescription(preview, locale.text, 'center');
      await expect(alignment.getByRole('radio', { name: 'Centrada', exact: true })).toBeChecked();
      if (target.recent) await expect(dialog.getByLabel('Nombre', { exact: true })).toBeDisabled();
    }
    await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = backend.state.tables.collections.find((collection) => collection.id === target.id)!;
    expect(saved.description_alignment).toBe('center');
    for (const key of ['description', 'translations', 'title', 'slug', 'is_recent', 'is_published', 'support_kind']) expect(saved[key]).toEqual(original[key]);
    expect(backend.state.tables.artworks).toEqual(artworks);
    expect(writes(backend)).toHaveLength(1);
    expect(writes(backend)[0].body.description_alignment).toBe('center');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Gestor de contenido', exact: true })).toBeVisible();
    // Auth survives a reload; edit mode intentionally requires opting in again.
    await page.getByRole('button', { name: 'Activar modo edición', exact: true }).click();
    dialog = await editCollection(page, backend, target);
    await expect(dialog.getByRole('radio', { name: 'Centrada', exact: true })).toBeChecked();
    await expectDescription(dialog.getByRole('region', { name: 'Vista previa de la descripción', exact: true }), locales[0].text, 'center');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await showPublicSite(page);
    const completedWrites = writes(backend).length;
    for (const locale of locales) {
      await page.goto(target.path.slice(0, target.path.lastIndexOf('/')));
      await selectPublicLocale(page, locale.name);
      await expectIndexDescription(page, target.path, locale.text, 'center');
      await page.reload();
      const card = await expectIndexDescription(page, target.path, locale.text, 'center');
      await card.click();
      await expect(page).toHaveURL(new RegExp(`${target.path}$`));
      await expectDescription(page, locale.text, 'center');
      await page.reload();
      await expectDescription(page, locale.text, 'center');
      await page.goto(`/obra/${target.slug}`);
      await expectDescription(page, locale.text, 'center');
    }
    expect(writes(backend)).toHaveLength(completedWrites);
    expect(backend.state.uploads).toEqual([]);
    expect(backend.state.deletedAssets).toEqual([]);
  });
}

test('a new empty collection saves its centered multiline description and exposes it directly under its index title', async ({ page, backend }) => {
  await openManager(page, backend);
  await page.getByRole('button', { name: 'Obra en papel', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva colección', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva colección de obra en papel', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Papel en diálogo');
  await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(locales[0].text);
  await expect(dialog.getByRole('radio', { name: 'Justificada', exact: true })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Centrada', exact: true }).check();
  await expectDescription(dialog.getByRole('region', { name: 'Vista previa de la descripción', exact: true }), locales[0].text, 'center');
  expect(writes(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Crear colección', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = backend.state.tables.collections.find((row) => row.title === 'Papel en diálogo')!;
  expect(saved.description_alignment).toBe('center');
  expect(saved.description).toBe(locales[0].text);
  expect(saved.is_recent).toBe(false);
  expect(saved.support_kind).toBe('paper');
  expect(writes(backend)).toHaveLength(1);
  await showPublicSite(page);
  await page.goto('/laminas');
  await expectIndexDescription(page, `/laminas/${saved.slug}`, locales[0].text, 'center');
  await page.reload();
  const card = await expectIndexDescription(page, `/laminas/${saved.slug}`, locales[0].text, 'center');
  await expect(card.locator('.support-collection-preview-card__artwork')).toHaveCount(0);
  await card.click();
  await expectDescription(page, locales[0].text, 'center');
  await expect(page.locator('article.artwork-showcase')).toHaveCount(0);
  expect(writes(backend)).toHaveLength(1);
});

for (const target of [collections[0], collections[2]]) {
  test(`${target.id}: editing from a Catalan visit opens the Catalan description and preserves the other languages`, async ({ page, backend }) => {
    const row = backend.state.tables.collections.find((collection) => collection.id === target.id)!;
    row.description = 'Descripción original en español.';
    for (const locale of locales.slice(1)) row.translations[locale.code] = { ...row.translations[locale.code], description: locale.text };
    const before = structuredClone(row);
    await page.goto('/');
    await selectPublicLocale(page, 'Català');
    await openManager(page, backend);
    const dialog = await editCollection(page, backend, target);
    const catalanTab = dialog.getByRole('tab').filter({ has: page.locator('span', { hasText: /^CA$/ }) });
    await expect(catalanTab).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.getByRole('textbox', { name: /^Descripción/ })).toHaveValue(locales[1].text);
    const edited = 'Descripció catalana revisada des del gestor.\nSegona línia.\n\nUn altre paràgraf.';
    await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(edited);
    await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
    await expect(dialog).toBeHidden();
    const saved = backend.state.tables.collections.find((collection) => collection.id === target.id)!;
    expect(saved.description).toBe(before.description);
    expect(saved.translations.ca.description).toBe(edited);
    for (const language of ['en', 'de']) expect(saved.translations[language]).toEqual(before.translations[language]);
    if (target.recent) expect(saved.translations.ca.title).toBe(before.translations.ca.title);
    await showPublicSite(page);
    for (const path of [target.path, `/obra/${target.slug}`]) {
      await page.goto(path);
      await expectDescription(page, edited);
      await page.reload();
      await expectDescription(page, edited);
    }
  });
}

test('cancelled or failed collection edits never replace the published description, retry saves paragraphs, and clearing every locale removes the block', async ({ page, backend }) => {
  const target = collections[0];
  const original = backend.state.tables.collections.find((row) => row.id === target.id)!.description;
  await openManager(page, backend);
  let dialog = await editCollection(page, backend, target);
  await dialog.getByRole('textbox', { name: /^Descripción/ }).fill('Un borrador descartado.');
  await dialog.getByRole('radio', { name: 'Centrada', exact: true }).check();
  await expectDescription(dialog.getByRole('region', { name: 'Vista previa de la descripción', exact: true }), 'Un borrador descartado.', 'center');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(writes(backend)).toEqual([]);
  expect(backend.state.tables.collections.find((row) => row.id === target.id)!.description).toBe(original);
  expect(backend.state.tables.collections.find((row) => row.id === target.id)!.description_alignment).toBe('justify');
  dialog = await editCollection(page, backend, target);
  await expect(dialog.getByRole('radio', { name: 'Justificada', exact: true })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Centrada', exact: true }).check();
  await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(locales[0].text);
  backend.failNext({ table: 'collections', method: 'PATCH', message: 'No se pudo guardar la descripción' });
  await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar la descripción');
  await expect(dialog.getByRole('textbox', { name: /^Descripción/ })).toHaveValue(locales[0].text);
  await expect(dialog.getByRole('radio', { name: 'Centrada', exact: true })).toBeChecked();
  await expectDescription(dialog.getByRole('region', { name: 'Vista previa de la descripción', exact: true }), locales[0].text, 'center');
  expect(backend.state.tables.collections.find((row) => row.id === target.id)!.description).toBe(original);
  expect(backend.state.tables.collections.find((row) => row.id === target.id)!.description_alignment).toBe('justify');
  await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
  await expect(dialog).toBeHidden();
  await showPublicSite(page);
  await page.goto(target.path);
  await expectDescription(page, locales[0].text, 'center');
  await selectPublicLocale(page, 'English');
  await expectDescription(page, locales[0].text, 'center'); // Missing translations use the saved Spanish text.
  await selectPublicLocale(page, 'Español');
  await openManager(page, backend);
  dialog = await editCollection(page, backend, target);
  await expect(dialog.getByRole('radio', { name: 'Centrada', exact: true })).toBeChecked();
  await dialog.getByRole('radio', { name: 'Justificada', exact: true }).check();
  for (const locale of locales) {
    await selectEditorLocale(dialog, locale.tab);
    await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(' \n\n\t ');
  }
  await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(backend.state.tables.collections.find((row) => row.id === target.id)!.description).toBe('');
  expect(backend.state.tables.collections.find((row) => row.id === target.id)!.description_alignment).toBe('justify');
  await showPublicSite(page);
  for (const path of [target.path, `/obra/${target.slug}`]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Horizontes', exact: true })).toBeVisible();
    await expect(page.locator('.collection-description')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('article.artwork-showcase')).toHaveCount(2);
    await expect(page.locator('.collection-description')).toHaveCount(0);
  }
  await page.goto('/lienzos');
  await expect(page.locator('.support-collection-preview-card__link[href="/lienzos/horizontes"] .collection-description')).toHaveCount(0);
});

test('collection descriptions escape HTML as plain text and wrap within phone margins without overlapping the title or artworks', async ({ page, backend }) => {
  const payload = '<img src="x" onerror="document.documentElement.dataset.collectionXss=1"><script>document.documentElement.dataset.collectionXss=2</script>';
  const paragraphs = ['Primera línea del texto.\nSegunda línea del mismo párrafo.', payload, `Referencia: ${'palabralarga'.repeat(25)}`];
  const description = paragraphs.join('\n\n');
  await openManager(page, backend);
  const dialog = await editCollection(page, backend, collections[0]);
  await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(description);
  await dialog.getByRole('button', { name: 'Guardar colección', exact: true }).click();
  await expect(dialog).toBeHidden();
  await showPublicSite(page);
  const completedWrites = writes(backend).length;
  for (const path of ['/lienzos/horizontes', '/obra/horizontes']) {
    await page.goto(path);
    await expectDescription(page, description);
    await expect(page.locator('.collection-description img, .collection-description script')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.collectionXss)).toBeUndefined();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const bounds = (selector: string) => {
          const box = document.querySelector(selector)!.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
        };
        return { title: bounds('.support-detail-heading h1'), description: bounds('.collection-description'), text: bounds('.collection-description p'), artwork: bounds('article.artwork-showcase'), overflow: document.documentElement.scrollWidth - innerWidth };
      });
      expect(layout.text.left).toBeGreaterThanOrEqual(24);
      expect(layout.text.right).toBeLessThanOrEqual(width - 24);
      expect(layout.description.top - layout.title.bottom).toBeGreaterThanOrEqual(12);
      expect(layout.artwork.top - layout.description.bottom).toBeGreaterThanOrEqual(20);
      expect(layout.overflow).toBeLessThanOrEqual(1);
      await expect(page.locator('article.artwork-showcase')).toHaveCount(2);
    }
  }
  await page.goto('/lienzos');
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const card = await expectIndexDescription(page, '/lienzos/horizontes', description);
    await expect(card.locator('.collection-description img, .collection-description script')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.collectionXss)).toBeUndefined();
    await expect(card.locator('.support-collection-preview-card__artwork')).toHaveCount(2);
    if (width === 1440) {
      await page.locator('.header-language__trigger').focus();
      await page.mouse.move(0, 0);
      const text = card.locator('.collection-description p').first();
      const originalColor = await text.evaluate((element) => getComputedStyle(element).color);
      await card.hover();
      await expect(text).toHaveCSS('color', originalColor);
      await card.focus();
      await page.mouse.move(0, 0);
      await expect(card).toBeFocused();
      await expect(text).toHaveCSS('color', originalColor);
    }
  }
  expect(writes(backend)).toHaveLength(completedWrites);
});

test('missing, blank and hidden collection descriptions never create an empty or private public block', async ({ page, backend }) => {
  const row = backend.state.tables.collections.find((collection) => collection.id === 'collection-canvas')!;
  for (const alignment of [undefined, null, 'left', 'center; color: red']) {
    row.description_alignment = alignment;
    await page.goto('/lienzos/horizontes');
    await expectDescription(page, row.description);
    await page.goto('/lienzos');
    await expectIndexDescription(page, '/lienzos/horizontes', row.description);
  }
  row.description_alignment = 'justify';
  for (const value of [undefined, null, '', ' \n\n\t ']) {
    row.description = value;
    for (const path of ['/lienzos/horizontes', '/obra/horizontes']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Horizontes', exact: true })).toBeVisible();
      await expect(page.locator('.collection-description')).toHaveCount(0);
    }
  }
  row.description = 'Texto privado que no debe mostrarse.';
  row.is_published = false;
  for (const path of ['/lienzos/horizontes', '/obra/horizontes']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Horizontes', exact: true })).toHaveCount(0);
    await expect(page.locator('.collection-description')).toHaveCount(0);
    await expect(page.getByText('Texto privado que no debe mostrarse.', { exact: true })).toHaveCount(0);
  }
  await page.goto('/lienzos');
  await expect(page.locator('.support-collection-preview-card__link[href="/lienzos/horizontes"]')).toHaveCount(0);
  await expect(page.getByText('Texto privado que no debe mostrarse.', { exact: true })).toHaveCount(0);
  expect(writes(backend)).toEqual([]);
});
