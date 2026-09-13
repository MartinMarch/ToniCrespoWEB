import type { Locator, Page } from '@playwright/test';
import { test, expect, fixtureImage, MOCK_SUPABASE_URL, type MockSupabaseBackend } from '../helpers/mock-supabase';

// Real React, forms, carousel and services; only remote HTTP is intercepted.
// Galleries and editorial writes below belong exclusively to this local fixture.
const image = (name: string) => ({ name, mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64') });
const exhibitionTitle = 'Exposición de primavera';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('toni-crespo-language')) localStorage.setItem('toni-crespo-language', 'es');
  });
});

function galleryFixture(backend: MockSupabaseBackend, count = 6) {
  const news = backend.state.tables.news_items.find((row) => row.id === 'news-exhibition')!;
  const gallery = Array.from({ length: count }, (_, index) => {
    const path = `news/fixtures/gallery-${index + 1}.svg`;
    backend.state.storage[path] = { body: fixtureImage(index % 2 ? 400 : 700, index % 2 ? 650 : 400), contentType: 'image/svg+xml' };
    return { id: `news-gallery-${index + 1}`, news_item_id: news.id, image_url: `${MOCK_SUPABASE_URL}/storage/v1/object/public/${path}`,
      image_alt: `Vista de la exposición ${index + 1}`, caption: `Pie propio ${index + 1}`, translations: { ca: { alt: `Vista catalana ${index + 1}`, caption: `Peu propi ${index + 1}` }, en: { alt: `Exhibition view ${index + 1}` } }, sort_order: index, is_primary: index === 0 };
  });
  backend.state.tables.news_item_images = [...backend.state.tables.news_item_images.filter((row) => row.news_item_id !== news.id), ...gallery];
  news.image_url = gallery[0]?.image_url ?? null;
  news.image_alt = gallery[0]?.image_alt ?? null;
  return { news, gallery };
}

function card(page: Page, title = exhibitionTitle) {
  return page.locator('.news-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

function writes(backend: MockSupabaseBackend) {
  return backend.requests.filter((request) => new URL(request.url).pathname.startsWith('/rest/v1/')
    && !new URL(request.url).pathname.endsWith('/rpc/is_admin') && !['GET', 'HEAD'].includes(request.method));
}

function snapshot(backend: MockSupabaseBackend) {
  return structuredClone({ news: backend.state.tables.news_items, images: backend.state.tables.news_item_images });
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

async function login(page: Page, backend: MockSupabaseBackend) {
  await page.goto('/noticias');
  await backend.signIn(page);
  await expect(page.getByRole('button', { name: 'Añadir noticia', exact: true })).toBeVisible();
}

async function createForm(page: Page) {
  await page.getByRole('button', { name: 'Añadir noticia', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir noticia', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function editForm(page: Page, title = exhibitionTitle) {
  await card(page, title).getByRole('button', { name: `Editar noticia: ${title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar noticia', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function editorLocale(dialog: Locator, locale: 'ES' | 'CA' | 'EN' | 'DE') {
  await dialog.getByRole('tab').filter({ has: dialog.page().locator('span', { hasText: new RegExp(`^${locale}$`) }) }).click();
}

async function publicLocale(page: Page, language: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.header-language__trigger').click();
  await page.getByRole('menuitemradio', { name: new RegExp(`^${language}`) }).click();
}

async function fillNews(dialog: Locator, title: string) {
  await dialog.getByLabel('Título', { exact: true }).fill(title);
  await dialog.getByLabel('Fecha', { exact: true }).fill('2026-09-13');
  await dialog.getByRole('textbox', { name: /^Descripción/ }).fill('Primera línea de la noticia.\nSegunda línea.\n\nUn párrafo completo sin recortes.');
  await dialog.getByLabel('Texto alternativo de imágenes', { exact: true }).fill('Imágenes del taller');
}

test('the responsive news feed exposes every image, complete paragraphs and safe links without framed mobile cards or overflow', async ({ page, backend }) => {
  const { news, gallery } = galleryFixture(backend);
  const description = `Primer párrafo de la noticia.\nOtra línea del mismo párrafo.\n\n${'Pintura y memoria. '.repeat(40)}\n\n${'referencialarga'.repeat(45)}`;
  news.description = description;
  const original = snapshot(backend);
  await page.goto('/noticias');
  const item = card(page);
  await expect(item.locator('.news-card__zoom-button')).toHaveCount(6);
  expect(await item.locator('.news-carousel__slide img').evaluateAll((images) => images.map((element) => element.getAttribute('src')))).toEqual(gallery.map((entry) => entry.image_url));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(item).toHaveCSS('box-shadow', 'none');
    for (const photograph of await item.locator('.news-carousel__slide img').all()) await expect(photograph).toHaveCSS('object-fit', 'contain');
    if (width <= 768) {
      await expect(item).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(item).toHaveCSS('border-left-width', '0px');
      await expect(item).toHaveCSS('border-right-width', '0px');
      await expect(item).toHaveCSS('border-radius', '0px');
    }
    const paragraph = item.locator('.news-card__description');
    await expect(paragraph).toHaveText(description);
    await expect(paragraph).toHaveCSS('white-space', /pre-line|pre-wrap/);
    await expect(paragraph).toHaveCSS('text-align', 'justify');
    const geometry = await item.evaluate((element) => {
      const description = element.querySelector('.news-card__description')!;
      const link = element.querySelector('.news-card__link')!;
      const track = element.querySelector('.news-carousel__track')!;
      return { descriptionBottom: description.getBoundingClientRect().bottom, linkTop: link.getBoundingClientRect().top,
        clipped: description.scrollHeight - description.clientHeight, scrollable: track.scrollWidth > track.clientWidth };
    });
    expect(geometry.linkTop).toBeGreaterThanOrEqual(geometry.descriptionBottom);
    expect(geometry.clipped).toBeLessThanOrEqual(1);
    expect(geometry.scrollable).toBe(true);
    await expect(item.getByRole('link', { name: 'Visitar la noticia', exact: true })).toHaveAttribute('href', news.external_url);
    await noOverflow(page);
  }
  expect(snapshot(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
});

test('carousel buttons, keyboard and position controls scroll to all six images and return focus after zoom', async ({ page, backend }) => {
  galleryFixture(backend);
  await page.goto('/noticias');
  const item = card(page);
  const region = item.getByRole('region', { name: `Imágenes de ${exhibitionTitle}`, exact: true });
  const track = region.locator('.news-carousel__track');
  const previous = region.getByRole('button', { name: 'Imagen anterior', exact: true });
  const next = region.getByRole('button', { name: 'Imagen siguiente', exact: true });
  await expect(previous).toBeDisabled();
  await next.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
  await expect(previous).toBeEnabled();
  await region.getByRole('button', { name: 'Ver imagen 6', exact: true }).click();
  await expect.poll(() => track.evaluate((element) => element.scrollWidth - element.clientWidth - element.scrollLeft)).toBeLessThan(3);
  await expect(next).toBeDisabled();
  const zoom = item.locator('.news-card__zoom-button').nth(5);
  await zoom.click();
  const lightbox = page.locator('.photo-lightbox');
  await expect(lightbox).toHaveAttribute('role', 'dialog');
  await expect(lightbox).toHaveAttribute('aria-modal', 'true');
  await expect(lightbox.locator('img')).toHaveAttribute('src', /gallery-6\.svg$/);
  await page.keyboard.press('Tab');
  expect(await lightbox.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
  await expect(zoom).toBeFocused();
  await region.getByRole('button', { name: 'Ver imagen 1', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeLessThan(3);
  expect(writes(backend)).toEqual([]);
});

test('a real touch swipe or horizontal wheel scrolls the gallery without accidentally opening the image', async ({ page, backend, isMobile }) => {
  galleryFixture(backend);
  await page.goto('/noticias');
  const item = card(page);
  const track = item.locator('.news-carousel__track');
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    const start = { x: box.x + box.width * .85, y: box.y + Math.min(box.height / 2, 180) };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= 8; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x - box.width * .7 * step / 8, y: start.y }] });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await track.hover();
    await page.mouse.wheel(box.width, 0);
  }
  await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(50);
  await expect(page.locator('.photo-lightbox')).toHaveCount(0);
  await noOverflow(page);
  expect(writes(backend)).toEqual([]);
});

test('compact filters remain collapsed initially, handle accent-insensitive search and dates, and announce results when cleared', async ({ page, backend }) => {
  await page.goto('/noticias');
  const cards = page.locator('.news-card');
  const toggle = page.getByRole('button', { name: 'Filtros', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Desde', { exact: true })).toBeHidden();
  const search = page.getByRole('searchbox', { name: 'Buscar', exact: true });
  await search.fill('soller');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Entrevista en el taller');
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await search.fill('EXPOSICION');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText(exhibitionTitle);
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('Desde', { exact: true }).fill('2026-05-12');
  await page.getByLabel('Hasta', { exact: true }).fill('2026-05-12');
  await page.getByRole('combobox', { name: /^Categoría/ }).selectOption('exposicion');
  await expect(cards).toHaveCount(1);
  await expect(page.locator('.news-filters__summary').getByRole('status')).toContainText(/1/);
  await expect(toggle.locator('.news-filters__badge')).toHaveText('3');
  await toggle.click();
  await expect(page.getByLabel('Desde', { exact: true })).toBeHidden();
  await expect(cards).toHaveCount(1);
  await search.fill('No coincide con ninguna noticia');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('No hay noticias que coincidan con la búsqueda.', { exact: true })).toBeVisible();
  await expect(page.locator('.news-filters__summary').getByRole('status')).toContainText(/0/);
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(search).toHaveValue('');
  await toggle.click();
  await expect(page.getByLabel('Desde', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Hasta', { exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: /^Categoría/ })).toHaveValue('all');
  await expect(toggle.locator('.news-filters__badge')).toHaveCount(0);
  await noOverflow(page);
  expect(writes(backend)).toEqual([]);
});

test('text-only news render gracefully and only explicit safe HTTP links appear after escaped descriptions', async ({ page, backend }) => {
  const { news } = galleryFixture(backend, 0);
  news.description = '<img src="x" onerror="document.documentElement.dataset.newsXss=1">\n\nUna noticia sin fotografías.';
  for (const url of [null, '', 'javascript:alert(1)', 'data:text/html,unsafe', '//example.test/relative', 'https://example.test/noticia', 'http://example.test/noticia']) {
    news.external_url = url;
    await page.goto('/noticias');
    const item = card(page);
    await expect(item).toBeVisible();
    await expect(item.locator('.news-carousel__track, .news-card__zoom-button')).toHaveCount(0);
    await expect(item.locator('.news-card__description')).toHaveText(news.description);
    await expect(item.locator('.news-card__description img')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.dataset.newsXss)).toBeUndefined();
    const link = item.getByRole('link', { name: 'Visitar la noticia', exact: true });
    if (url?.startsWith('http')) {
      await expect(link).toHaveAttribute('href', url);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noopener/);
    } else await expect(link).toHaveCount(0);
    await noOverflow(page);
  }
  expect(writes(backend)).toEqual([]);
});

test('the mobile editor accumulates file batches, previews, reorders and removes locally; cancelling writes nothing', async ({ page, backend }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await login(page, backend);
  const original = snapshot(backend);
  const dialog = await createForm(page);
  await fillNews(dialog, 'Una galería todavía en borrador');
  const input = dialog.getByLabel('Añadir imágenes', { exact: true });
  const images = dialog.locator('.news-editor-image');
  await input.setInputFiles([image('primera.png'), image('segunda.png')]);
  await expect(images).toHaveCount(2);
  const firstBatch = await images.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-image-key')));
  await input.setInputFiles([image('tercera.png'), image('cuarta.png')]);
  await expect(images).toHaveCount(4);
  const keys = await images.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-image-key')));
  expect(keys.slice(0, 2)).toEqual(firstBatch);
  expect(new Set(keys).size).toBe(4);
  for (const preview of await images.locator('img').all()) {
    await expect(preview).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => preview.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Adelantar imagen 4', exact: true }).click();
  await dialog.getByRole('button', { name: 'Adelantar imagen 3', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect(await images.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-image-key')))).toEqual([keys[0], keys[3], keys[1], keys[2]]);
  await dialog.getByRole('button', { name: 'Quitar imagen 3', exact: true }).click();
  await expect(images).toHaveCount(3);
  await expect(dialog.getByRole('button', { name: 'Quitar imagen 3', exact: true })).toBeFocused();
  expect(await images.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-image-key')))).toEqual([keys[0], keys[3], keys[2]]);
  await expect(images.first()).toContainText('Portada');
  await expect(dialog.getByRole('button', { name: 'Adelantar imagen 1', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Retrasar imagen 3', exact: true })).toBeDisabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 700 });
    await noOverflow(page);
    expect(await dialog.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    for (const button of await images.getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  }
  expect(writes(backend)).toEqual([]);
  expect(backend.state.uploads).toEqual([]);
  for (let remaining = 3; remaining > 0; remaining--) {
    await dialog.getByRole('button', { name: 'Quitar imagen 1', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(images).toHaveCount(remaining - 1);
    if (remaining > 1) await expect(dialog.getByRole('button', { name: 'Quitar imagen 1', exact: true })).toBeFocused();
    else await expect(input).toBeFocused();
  }
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(snapshot(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('saving accumulated images creates one atomic news gallery with ordered cover and independent translations', async ({ page, backend }) => {
  await page.goto('/noticias');
  await publicLocale(page, 'Català');
  await backend.signIn(page);
  const dialog = await createForm(page);
  await expect(dialog.getByRole('tab', { selected: true })).toContainText('ES');
  await fillNews(dialog, 'Galería de septiembre');
  const description = await dialog.getByRole('textbox', { name: /^Descripción/ }).inputValue();
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles([image('uno.png'), image('dos.png')]);
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles([image('tres.png'), image('cuatro.png')]);
  await dialog.getByRole('button', { name: 'Adelantar imagen 4', exact: true }).click();
  for (const [locale, title] of [['CA', 'Galeria de setembre'], ['EN', 'September gallery'], ['DE', 'Septembergalerie']] as const) {
    await editorLocale(dialog, locale);
    await dialog.getByLabel('Título', { exact: true }).fill(title);
    await dialog.getByRole('textbox', { name: /^Descripción/ }).fill(`Texto ${locale}.\n\nSegundo párrafo ${locale}.`);
  }
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = backend.state.tables.news_items.find((row) => row.title === 'Galería de septiembre')!;
  expect(saved.description).toBe(description);
  const savedImages = backend.state.tables.news_item_images.filter((row) => row.news_item_id === saved.id).sort((a, b) => a.sort_order - b.sort_order);
  expect(savedImages).toHaveLength(4);
  expect(savedImages.map((row) => row.sort_order)).toEqual([0, 1, 2, 3]);
  for (const [index, name] of ['uno', 'dos', 'cuatro', 'tres'].entries()) expect(savedImages[index].image_url).toMatch(new RegExp(`/${name}-[^/]+\\.png$`));
  expect(savedImages.map((row) => row.is_primary)).toEqual([true, false, false, false]);
  expect(saved.image_url).toBe(savedImages[0].image_url);
  expect(backend.state.uploads).toHaveLength(4);
  expect(writes(backend)).toHaveLength(1);
  expect(new URL(writes(backend)[0].url).pathname).toBe('/rest/v1/rpc/save_news_item');
  expect(writes(backend)[0].body.image_items.map((entry: { image_url: string }) => entry.image_url)).toEqual(savedImages.map((row) => row.image_url));
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  for (const [language, title, locale] of [['Español', 'Galería de septiembre', 'es'], ['Català', 'Galeria de setembre', 'ca'], ['English', 'September gallery', 'en'], ['Deutsch', 'Septembergalerie', 'de']]) {
    await publicLocale(page, language);
    await expect(card(page, title).locator('.news-card__description')).toHaveText(locale === 'es' ? description : `Texto ${locale.toUpperCase()}.\n\nSegundo párrafo ${locale.toUpperCase()}.`);
    await expect(card(page, title).locator('.news-card__zoom-button')).toHaveCount(4);
    await page.reload();
    await expect(card(page, title)).toBeVisible();
  }
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('editing an existing gallery starts in the viewed language and retains per-image metadata across reorder and new files', async ({ page, backend }) => {
  const { news, gallery } = galleryFixture(backend, 3);
  news.translations = { ca: { title: 'Exposició de primavera', description: 'Descripció catalana original.' }, en: { title: 'Spring exhibition', description: 'Original English description.' }, de: { description: 'Deutsche Beschreibung.' } };
  const original = structuredClone(news);
  await page.goto('/noticias');
  await publicLocale(page, 'Català');
  await backend.signIn(page);
  const dialog = await editForm(page, 'Exposició de primavera');
  await expect(dialog.getByRole('tab', { selected: true })).toContainText('CA');
  await expect(dialog.getByRole('textbox', { name: /^Descripción/ })).toHaveValue('Descripció catalana original.');
  await dialog.getByRole('textbox', { name: /^Descripción/ }).fill('Una nova descripció.\n\nAmb dos paràgrafs.');
  await dialog.getByRole('button', { name: 'Quitar imagen 2', exact: true }).click();
  await dialog.getByRole('button', { name: 'Adelantar imagen 2', exact: true }).click();
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles(image('nueva-vista.png'));
  expect(snapshot(backend).news.find((row) => row.id === news.id)).toEqual(original);
  expect(writes(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = backend.state.tables.news_items.find((row) => row.id === news.id)!;
  expect(saved.description).toBe(original.description);
  expect(saved.translations.ca.description).toBe('Una nova descripció.\n\nAmb dos paràgrafs.');
  expect(saved.translations.en).toEqual(original.translations.en);
  expect(saved.translations.de).toEqual(original.translations.de);
  for (const key of ['slug', 'sort_order', 'is_published']) expect(saved[key]).toEqual(original[key]);
  const savedImages = backend.state.tables.news_item_images.filter((row) => row.news_item_id === news.id).sort((a, b) => a.sort_order - b.sort_order);
  expect(savedImages).toHaveLength(3);
  expect(savedImages.slice(0, 2).map((row) => row.image_url)).toEqual([gallery[2].image_url, gallery[0].image_url]);
  expect(savedImages[0].caption).toBe(gallery[2].caption);
  expect(savedImages[0].translations).toEqual(gallery[2].translations);
  expect(savedImages[1].caption).toBe(gallery[0].caption);
  expect(savedImages[1].translations).toEqual(gallery[0].translations);
  expect(saved.image_url).toBe(gallery[2].image_url);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
  expect(writes(backend)).toHaveLength(1);
  await page.reload();
  await expect(card(page, 'Exposició de primavera').locator('.news-card__zoom-button')).toHaveCount(3);
});

test('an existing news item can lose every image and later gain a new one without deleting stored files or resurrecting the old cover', async ({ page, backend }) => {
  const { news, gallery } = galleryFixture(backend, 3);
  await login(page, backend);
  let dialog = await editForm(page);
  for (let remaining = 3; remaining > 0; remaining--) await dialog.getByRole('button', { name: 'Quitar imagen 1', exact: true }).click();
  await expect(dialog.locator('.news-editor-image')).toHaveCount(0);
  expect(writes(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page).locator('.news-card__zoom-button')).toHaveCount(0);
  expect(backend.state.tables.news_items.find((row) => row.id === news.id)!.image_url).toBeNull();
  expect(backend.state.tables.news_item_images.filter((row) => row.news_item_id === news.id)).toEqual([]);
  expect(writes(backend)[0].body.image_items).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
  await page.reload();
  await expect(card(page).locator('.news-card__zoom-button')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edición web', exact: true }).click();
  dialog = await editForm(page);
  await expect(dialog.locator('.news-editor-image')).toHaveCount(0);
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles(image('nueva-portada.png'));
  await dialog.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page).locator('.news-card__zoom-button')).toHaveCount(1);
  const saved = backend.state.tables.news_items.find((row) => row.id === news.id)!;
  expect(saved.image_url).toContain('/storage/v1/object/public/news/');
  expect(gallery.map((row) => row.image_url)).not.toContain(saved.image_url);
  expect(backend.state.deletedAssets).toEqual([]);
  expect(writes(backend)).toHaveLength(2);
});

test('an upload failure retains the complete draft and retry stores one news item with its complete gallery', async ({ page, backend }) => {
  await login(page, backend);
  const original = snapshot(backend);
  const dialog = await createForm(page);
  await fillNews(dialog, 'Galería con reintento de subida');
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles([image('retry-uno.png'), image('retry-dos.png')]);
  backend.failNext({ path: '/storage/v1/object/news/', method: 'POST', message: 'No se pudo subir esta imagen' });
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo subir esta imagen');
  await expect(dialog.locator('.news-editor-image')).toHaveCount(2);
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Galería con reintento de subida');
  expect(snapshot(backend)).toEqual(original);
  expect(writes(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = backend.state.tables.news_items.filter((row) => row.title === 'Galería con reintento de subida');
  expect(saved).toHaveLength(1);
  expect(backend.state.tables.news_item_images.filter((row) => row.news_item_id === saved[0].id)).toHaveLength(2);
  expect(backend.state.uploads).toHaveLength(2);
  expect(writes(backend)).toHaveLength(1);
});

test('a failed atomic save leaves existing content untouched, keeps uploaded files and retries without duplicate uploads', async ({ page, backend }) => {
  galleryFixture(backend, 2);
  await login(page, backend);
  const original = snapshot(backend);
  const dialog = await editForm(page);
  await dialog.getByLabel('Título', { exact: true }).fill('Exposición revisada');
  await dialog.getByRole('button', { name: 'Quitar imagen 1', exact: true }).click();
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles(image('guardar-retry.png'));
  backend.failNext({ path: '/rpc/save_news_item', method: 'POST', status: 400, code: '22023', message: 'No se pudo guardar la galería' });
  await dialog.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se pudo guardar la galería');
  expect(snapshot(backend)).toEqual(original);
  await expect(dialog.locator('.news-editor-image')).toHaveCount(2);
  await expect(dialog.getByLabel('Título', { exact: true })).toHaveValue('Exposición revisada');
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
  await dialog.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Exposición revisada').locator('.news-card__zoom-button')).toHaveCount(2);
  expect(backend.state.uploads).toHaveLength(1);
  expect(writes(backend)).toHaveLength(2);
  expect(backend.state.tables.news_items.filter((row) => row.title === 'Exposición revisada')).toHaveLength(1);
});

test('a committed news save followed by a failed refresh reloads the confirmed result without uploading or writing twice', async ({ page, backend }) => {
  await login(page, backend);
  const dialog = await createForm(page);
  await fillNews(dialog, 'Noticia guardada antes del fallo de lectura');
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles(image('confirmada.png'));
  backend.failNext({ table: 'news_items', method: 'GET', message: 'No se pudo recargar las noticias' });
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Volver a cargar', exact: true })).toBeVisible();
  expect(backend.state.tables.news_items.filter((row) => row.title === 'Noticia guardada antes del fallo de lectura')).toHaveLength(1);
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
  await dialog.getByRole('button', { name: 'Volver a cargar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Noticia guardada antes del fallo de lectura')).toBeVisible();
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
});

test('a committed edit with a failed refresh keeps the editor and previous feed available until the confirmed update is reloaded', async ({ page, backend }) => {
  galleryFixture(backend, 2);
  await login(page, backend);
  const dialog = await editForm(page);
  await dialog.getByLabel('Título', { exact: true }).fill('Exposición guardada pendiente de recargar');
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles(image('edicion-confirmada.png'));
  backend.failNext({ table: 'news_items', method: 'GET', message: 'No se pudo recargar las noticias' });
  await dialog.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('se ha guardado');
  await expect(dialog.getByRole('button', { name: 'Volver a cargar', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Título', { exact: true })).toBeDisabled();
  await expect(page.locator('.news-card')).toHaveCount(2);
  await expect(card(page)).toBeVisible();
  expect(backend.state.tables.news_items.find((row) => row.id === 'news-exhibition')!.title).toBe('Exposición guardada pendiente de recargar');
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Volver a cargar', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Exposición guardada pendiente de recargar').locator('.news-card__zoom-button')).toHaveCount(3);
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
});

test('a lost response after atomic commit can be checked without replaying the create or deleting its images', async ({ page, backend }) => {
  await login(page, backend);
  const dialog = await createForm(page);
  await fillNews(dialog, 'Una noticia con respuesta perdida');
  await dialog.getByLabel('Añadir imágenes', { exact: true }).setInputFiles(image('respuesta-perdida.png'));
  let intercepted = false;
  await page.route('**/rest/v1/rpc/save_news_item', async (route) => {
    if (intercepted) return route.fallback();
    intercepted = true;
    // Apply the fake server transaction, but replace only the HTTP response.
    // This models an uncertain transport outcome without touching real data.
    const fakeRoute = new Proxy(route, { get(target, property) {
      if (property === 'fulfill') return () => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'NETWORK_RESULT_UNKNOWN', message: 'Se perdió la respuesta de guardado' }) });
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    } });
    await backend.handle(fakeRoute, new URL(page.url()).origin);
  });
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se ha podido confirmar');
  await expect(dialog.getByRole('button', { name: 'Comprobar guardado', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Título', { exact: true })).toBeDisabled();
  expect(backend.state.tables.news_items.filter((row) => row.title === 'Una noticia con respuesta perdida')).toHaveLength(1);
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
  expect(backend.state.deletedAssets).toEqual([]);
  await dialog.getByRole('button', { name: 'Comprobar guardado', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(card(page, 'Una noticia con respuesta perdida')).toBeVisible();
  expect(writes(backend)).toHaveLength(1);
  expect(backend.state.uploads).toHaveLength(1);
});

test('editor validation rejects non-images and undecodable files before uploading, and rejects unsafe external URLs', async ({ page, backend }) => {
  await login(page, backend);
  const dialog = await createForm(page);
  await fillNews(dialog, 'Una noticia validada');
  const input = dialog.getByLabel('Añadir imágenes', { exact: true });
  await input.setInputFiles({ name: 'documento.txt', mimeType: 'text/plain', buffer: Buffer.from('No es una fotografía.') });
  await expect(dialog.getByRole('alert')).toContainText(/selecciona una imagen/i);
  await expect(dialog.locator('.news-editor-image')).toHaveCount(0);
  await input.setInputFiles({ name: 'archivo-invalido.png', mimeType: 'image/png', buffer: Buffer.from('Una extensión de imagen no convierte el texto en PNG.') });
  await expect(dialog.locator('.news-editor-image')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('No se puede leer');
  expect(writes(backend)).toEqual([]);
  expect(backend.state.uploads).toEqual([]);
  await dialog.getByRole('button', { name: 'Quitar imagen 1', exact: true }).click();
  await dialog.getByLabel('Enlace externo', { exact: true }).fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Crear noticia', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(writes(backend)).toEqual([]);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(backend.state.deletedAssets).toEqual([]);
});

test('the mock atomic-news protocol denies visitors and rejects invalid galleries before mutating either table', async ({ page, backend }) => {
  const { news, gallery } = galleryFixture(backend, 2);
  await page.goto('/noticias');
  const original = snapshot(backend);
  const payload = { target_news_id: news.id, news_data: { title: 'Un cambio no autorizado', published_at: '2026-09-13', date_text: null,
    category: 'exposicion', location: null, description: 'No debe llegar a publicarse.', external_url: null, image_alt: 'Una imagen', translations: {} },
  image_items: [{ image_url: gallery[0].image_url, caption: null, translations: {} }, { image_url: 'javascript:invalid', caption: null, translations: {} }] };
  async function request(role: 'admin' | 'nonAdmin' | null) {
    return page.evaluate(async ({ origin, payload, credentials }) => {
      let token = 'public-test-anon-key';
      if (credentials) {
        const authentication = await fetch(`${origin}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
        token = (await authentication.json()).access_token;
      }
      const response = await fetch(`${origin}/rest/v1/rpc/save_news_item`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
      return { status: response.status, body: await response.json() };
    }, { origin: MOCK_SUPABASE_URL, payload, credentials: role ? backend[role] : null });
  }
  for (const role of [null, 'nonAdmin'] as const) {
    const response = await request(role);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('42501');
    expect(snapshot(backend)).toEqual(original);
  }
  const rejected = await request('admin');
  expect(rejected.status).toBe(400);
  expect(rejected.body.code).toBe('22023');
  expect(snapshot(backend)).toEqual(original);
  expect(backend.state.uploads).toEqual([]);
  expect(backend.state.deletedAssets).toEqual([]);
});
