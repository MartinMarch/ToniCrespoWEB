import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { parseArtworkPage } from './lib/wordpressArtworkParser.mjs';

// Archival export only: no authentication, POSTs, app data or Supabase access.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://www.tonicrespo.com';
const startedAt = new Date().toISOString();
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Uso: node scripts/export-wordpress-artworks.mjs [--output CARPETA_NUEVA]\nDescarga únicamente el catálogo público de www.tonicrespo.com. Nunca sobrescribe una extracción.');
  process.exit(0);
}
if (args.length && (args.length !== 2 || args[0] !== '--output' || !args[1])) throw new Error('Opciones no válidas; usa --help.');
const output = resolve(ROOT, args[1] ?? `exports/wordpress-${startedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')}`);
if (output === ROOT || output === dirname(output)) throw new Error('La salida debe ser una carpeta nueva específica.');
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // EEXIST intentionally prevents overwriting any user data.
for (const folder of ['colecciones', 'fuentes/colecciones', 'fuentes/medios']) await mkdir(join(output, folder), { recursive: true });
const report = { source: ORIGIN, startedAt, finishedAt: null, status: 'in_progress', scope: 'Obras de las colecciones públicas de WordPress, contrastadas con el inventario de 2026-08-07.', collections: [], failures: [], warnings: [], historicalMissing: [], counts: {} };
const records = [];
let browser;
let dom;
let nextRequest = 0;
let admission = Promise.resolve();
const urlKey = (value) => { const u = new URL(value); return decodeURIComponent(u.pathname).normalize('NFC'); };
const slug = (value) => String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'sin-titulo';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const csvCell = (value) => { const s = String(value ?? ''); return `"${(/^[\s]*[=+@-]/.test(s) ? "'" : '') + s.replaceAll('"', '""')}"`; };
const saveJSON = (file, data) => writeFile(join(output, file), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });

function safeUrl(value) {
  const u = new URL(value, ORIGIN);
  if (u.protocol !== 'https:' || !['www.tonicrespo.com', 'tonicrespo.com'].includes(u.hostname) || u.port || u.username || u.password) throw new Error(`Origen no permitido: ${u.origin}`);
  return u.href;
}

async function fetchPublic(value, limit = 8 * 1024 * 1024) {
  const url = safeUrl(value);
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    const turn = admission.then(async () => { await sleep(Math.max(0, nextRequest - Date.now())); nextRequest = Date.now() + 300; });
    admission = turn.catch(() => {});
    await turn;
    let retryMs = 1000 * 2 ** attempt;
    try {
      let current = url;
      let response;
      for (let redirects = 0; redirects <= 4; redirects++) {
        response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'ToniCrespo-Archive/1.0 (public artwork preservation)', Accept: '*/*' } });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location || redirects === 4) throw new Error('Redirección no válida o excesiva.');
        current = safeUrl(new URL(location, current).href);
      }
      if (!response.ok) {
        const advertised = response.headers.get('retry-after');
        if (advertised) {
          const ms = /^\d+$/.test(advertised) ? Number(advertised) * 1000 : Date.parse(advertised) - Date.now();
          if (Number.isFinite(ms)) retryMs = Math.max(retryMs, ms);
        }
        await response.body?.cancel();
        const failure = new Error(`HTTP ${response.status}: ${current}`);
        failure.permanent = response.status !== 429 && response.status < 500;
        if (retryMs > 60_000) failure.permanent = true;
        throw failure;
      }
      if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Archivo supera el límite de tamaño.'); }
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) throw new Error('Respuesta supera el límite de tamaño.');
        chunks.push(chunk);
      }
      return { data: Buffer.concat(chunks), headers: response.headers, url: current };
    } catch (caught) {
      error = caught;
      if (caught.permanent || attempt === 2) break;
      nextRequest = Math.max(nextRequest, Date.now() + retryMs);
      await sleep(retryMs);
    }
  }
  throw error;
}

async function listApi(kind, fields) {
  const items = [];
  const ids = new Set();
  let expectedTotal;
  for (let page = 1, total = 1; page <= total; page++) {
    if (page > 100) throw new Error('Paginación API excesiva.');
    const response = await fetchPublic(`${ORIGIN}/wp-json/wp/v2/${kind}?per_page=100&page=${page}&_fields=${fields}`);
    const batch = JSON.parse(response.data.toString('utf8'));
    if (!Array.isArray(batch)) throw new Error(`La API ${kind} no devuelve una lista.`);
    total = Number(response.headers.get('x-wp-totalpages'));
    if (!Number.isInteger(total) || total < 1 || Number(response.headers.get('x-wp-total')) < batch.length) throw new Error(`Cabeceras de paginación no válidas en ${kind}.`);
    const reportedTotal = Number(response.headers.get('x-wp-total'));
    if (!Number.isSafeInteger(reportedTotal) || reportedTotal < 0 || (expectedTotal !== undefined && expectedTotal !== reportedTotal)) throw new Error(`El total de ${kind} no es estable durante la extracción.`);
    expectedTotal = reportedTotal;
    for (const item of batch) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0 || ids.has(item.id)) throw new Error(`ID no válido o repetido en ${kind}.`);
      ids.add(item.id);
    }
    items.push(...batch);
  }
  if (items.length !== expectedTotal) throw new Error(`La API ${kind} está incompleta: ${items.length}/${expectedTotal}.`);
  return items;
}

async function textFromHtml(html) {
  return dom.evaluate(value => {
    const doc = new DOMParser().parseFromString(value ?? '', 'text/html');
    doc.querySelectorAll('script, style, template').forEach(node => node.remove());
    doc.querySelectorAll('br').forEach(node => node.replaceWith(doc.createTextNode('\n')));
    doc.querySelectorAll('p, div, li').forEach(node => node.appendChild(doc.createTextNode('\n')));
    return doc.body.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }, html);
}

async function extractCollection(page, number) {
  const collection = { wordpressId: page.id, title: await textFromHtml(page.title.rendered), slug: page.slug, sourceUrl: page.link, folder: `colecciones/${String(number).padStart(2, '0')}-${slug(page.slug)}`, pages: [], artworkCount: 0, emptyGallery: false };
  const artworks = [];
  const seenImages = new Set();
  const queue = [page.link];
  const seenPages = new Set();
  while (queue.length) {
    const url = safeUrl(queue.shift());
    if (seenPages.has(url)) continue;
    if (seenPages.size >= 50) throw new Error(`Demasiadas páginas en ${page.slug}.`);
    seenPages.add(url);
    const response = await fetchPublic(url);
    const html = response.data.toString('utf8');
    const parsed = await dom.evaluate(parseArtworkPage, { html, sourceUrl: url });
    const sourceFile = `fuentes/colecciones/${slug(page.slug)}-${seenPages.size}.html`;
    await writeFile(join(output, sourceFile), response.data, { flag: 'wx' });
    collection.pages.push({ url, sourceFile, sha256: createHash('sha256').update(response.data).digest('hex'), count: parsed.artworks.length });
    collection.emptyGallery ||= parsed.emptyGallery;
    for (const artwork of parsed.artworks) {
      safeUrl(artwork.imageUrl);
      const key = urlKey(artwork.imageUrl);
      if (seenImages.has(key)) continue;
      seenImages.add(key);
      artworks.push({ ...artwork, sourcePage: url, sourceFile });
    }
    queue.push(...parsed.paginationUrls.filter(value => !seenPages.has(value)));
  }
  if (!artworks.length && !collection.emptyGallery) throw new Error(`No se pudo reconocer la galería ${page.slug}; no se considera vacía automáticamente.`);
  await mkdir(join(output, collection.folder));
  collection.artworkCount = artworks.length;
  report.collections.push(collection);
  await saveJSON(`${collection.folder}/coleccion.json`, collection);
  console.log(`${collection.title}: ${artworks.length} obras, ${collection.pages.length} página(s).`);
  return { collection, artworks };
}

async function downloadArtwork(artwork, collection, position, media) {
  const candidates = [];
  if (artwork.kind === 'wordpress' && media?.media_details?.original_image && media.source_url) candidates.push(new URL(media.media_details.original_image, media.source_url).href);
  if (media?.source_url && artwork.kind === 'wordpress') candidates.push(media.source_url);
  candidates.push(artwork.imageUrl);
  const attempts = [];
  let image;
  for (const url of new Set(candidates)) {
    try {
      const response = await fetchPublic(url, 80 * 1024 * 1024);
      const mime = response.headers.get('content-type')?.split(';')[0];
      if (!mime?.startsWith('image/')) throw new Error(`El servidor no devuelve una imagen (${mime}).`);
      const dimensions = await dom.evaluate(async ({ data, mime }) => {
        const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
        const result = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
      }, { data: response.data.toString('base64'), mime });
      if (!dimensions.width || !dimensions.height) throw new Error('Dimensiones de imagen vacías.');
      image = { ...response, mime, ...dimensions };
      attempts.push({ url, ok: true });
      break;
    } catch (error) { attempts.push({ url, ok: false, error: error.message }); }
  }
  if (!image) throw new Error(`No se puede descargar ${artwork.imageUrl}: ${attempts.map(a => a.error).join('; ')}`);
  const originalName = decodeURIComponent(basename(new URL(image.url).pathname));
  const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' })[image.mime];
  if (!extension) throw new Error(`Formato de imagen no admitido: ${image.mime}.`);
  const name = `${String(position).padStart(3, '0')}-${slug(artwork.title || originalName)}`;
  const imageFile = `${collection.folder}/${name}${extension}`;
  const metadataFile = `${collection.folder}/${name}.json`;
  const textFile = `${collection.folder}/${name}.txt`;
  const mediaCaption = media ? await textFromHtml(media.caption?.rendered ?? '') : '';
  const prose = [artwork.caption, artwork.description, mediaCaption].filter(Boolean).join('\n');
  const physicalDimensions = prose.match(/\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|m)\b(?:\s*\([^\n)]+\))?/i)?.[0] ?? null;
  const technique = prose.split(/[\n.]/).map(s => s.trim()).find(s => /^(?:acrílico|acrilico|óleo|oleo|acuarela|técnica mixta|tecnica mixta|collage|xilografía|xilografia|grabado|carboncillo|tinta)\b/i.test(s)) ?? null;
  const filenameTitle = slug(artwork.title) === slug(decodeURIComponent(basename(new URL(artwork.imageUrl).pathname, extname(new URL(artwork.imageUrl).pathname))));
  const record = { id: `${collection.slug}-${String(position).padStart(3, '0')}`, collection: collection.title, collectionSlug: collection.slug, collectionUrl: collection.sourceUrl, order: position, ...artwork, technique, physicalDimensions, mediaCaption, mediaId: media?.id ?? null, mediaMetadataFile: media ? `fuentes/medios/${media.id}.json` : null, originalFileName: originalName, downloadedUrl: image.url, imageFile, metadataFile, textFile, imagePixels: { width: image.width, height: image.height }, bytes: image.data.length, mime: image.mime, sha256: createHash('sha256').update(image.data).digest('hex'), downloadAttempts: attempts, needsEditorialReview: filenameTitle || artwork.titleSource === 'filename', notes: [] };
  if (record.needsEditorialReview) record.notes.push('El título publicado parece derivado del nombre de archivo; se conserva sin inventar un título editorial.');
  if (!physicalDimensions) record.notes.push('No se han encontrado medidas físicas con unidad explícita en el texto público; los píxeles son dimensiones de la fotografía, no de la obra.');
  await writeFile(join(output, imageFile), image.data, { flag: 'wx' });
  await saveJSON(metadataFile, record);
  await writeFile(join(output, textFile), `TÍTULO: ${record.title}\nCOLECCIÓN: ${record.collection}\n\nPIE DE FOTO:\n${record.caption || '(No indicado)'}\n\nDESCRIPCIÓN PUBLICADA:\n${record.description || '(No indicada)'}\n\nTÉCNICA: ${technique ?? '(No indicada explícitamente)'}\nMEDIDAS DE LA OBRA: ${physicalDimensions ?? '(No indicadas con unidad explícita)'}\nPIE DE FOTO EN WORDPRESS: ${mediaCaption || '(No indicado)'}\n\nARCHIVO: ${basename(imageFile)}\nIMAGEN: ${image.width} × ${image.height} píxeles\nPÁGINA ORIGINAL: ${record.sourcePage}\nIMAGEN PUBLICADA: ${record.imageUrl}\nIMAGEN DESCARGADA: ${record.downloadedUrl}\nSHA-256: ${record.sha256}\n\nNOTAS:\n${record.notes.map(n => `- ${n}`).join('\n') || 'Sin incidencias.'}\n`, { flag: 'wx' });
  return record;
}

async function finish() {
  records.sort((a, b) => a.imageFile.localeCompare(b.imageFile));
  report.finishedAt = new Date().toISOString();
  report.counts = { collections: report.collections.length, artworkReferences: records.length, uniqueFilesBySha256: new Set(records.map(a => a.sha256)).size, bytes: records.reduce((sum, a) => sum + a.bytes, 0), missingHistoricalReferences: report.historicalMissing.length, failures: report.failures.length, titlesNeedingReview: records.filter(a => a.needsEditorialReview).length };
  report.status = report.failures.length || report.historicalMissing.length ? 'partial' : 'complete_public_catalogue';
  await saveJSON('catalogo.json', { source: ORIGIN, extractedAt: startedAt, collections: report.collections, artworks: records });
  await saveJSON('informe.json', report);
  const fields = [['Colección', 'collection'], ['Orden', 'order'], ['Título publicado', 'title'], ['Pie de foto', 'caption'], ['Descripción publicada', 'description'], ['Técnica', 'technique'], ['Medidas físicas', 'physicalDimensions'], ['Pie de foto biblioteca WP', 'mediaCaption'], ['Imagen', 'imageFile'], ['Ficha', 'textFile'], ['URL página', 'sourcePage'], ['URL imagen publicada', 'imageUrl'], ['URL descargada', 'downloadedUrl'], ['Revisar título', 'needsEditorialReview'], ['SHA256', 'sha256']];
  await writeFile(join(output, 'catalogo.csv'), '\ufeff' + [fields.map(([label]) => csvCell(label)).join(';'), ...records.map(record => fields.map(([, key]) => csvCell(record[key])).join(';'))].join('\r\n') + '\r\n', { flag: 'wx' });
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Archivo de obras · Toni Crespo</title><style>body{font:16px/1.55 system-ui,sans-serif;margin:32px auto;padding:0 24px;max-width:1300px;background:#f5f4f0;color:#222}h1,h2{font-weight:500}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#464c59}section{margin-top:48px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}article{background:white;padding:18px;border:1px solid #ddd;min-width:0}img{width:100%;height:250px;object-fit:contain}p{white-space:pre-line;overflow-wrap:anywhere}small{color:#666}</style><h1>Archivo de obras · Toni Crespo</h1><p>Fuente: ${escape(ORIGIN)} · Extraído: ${escape(startedAt)}<br>${records.length} referencias de obra en ${report.collections.length} colecciones. ${report.status === 'partial' ? 'Extracción parcial: consulta LEEME.txt e informe.json.' : 'Catálogo público comprobado contra el inventario conservado.'}</p><p>Los textos se conservan tal como están publicados. La ausencia de técnica o medidas no se completa con suposiciones. Esta copia no incluye obras privadas, borradas ni imágenes sin vínculo confirmado a una colección.</p><p><a href="catalogo.csv">Catálogo CSV</a> · <a href="LEEME.txt">Alcance y notas</a> · <a href="informe.json">Informe de verificación</a></p><nav>${report.collections.map(c => `<a href="#${escape(c.slug)}">${escape(c.title)} (${c.artworkCount})</a>`).join('')}</nav>${report.collections.map(c => `<section id="${escape(c.slug)}"><h2>${escape(c.title)}</h2>${c.emptyGallery ? '<p>La página original indica que no se han encontrado imágenes.</p>' : ''}<div class="grid">${records.filter(a => a.collectionSlug === c.slug).map(a => `<article><a href="${escape(a.imageFile)}"><img loading="lazy" src="${escape(a.imageFile)}" alt="${escape(a.title)}"></a><h3>${escape(a.title)}</h3><p>${escape(a.description || a.caption || 'Sin descripción publicada.')}</p><p><a href="${escape(a.textFile)}">Ficha completa</a> · <a href="${escape(a.metadataFile)}">Datos JSON</a> · <a rel="noreferrer" href="${escape(a.sourcePage)}">Fuente</a></p><small>${a.needsEditorialReview ? 'Título publicado derivado del archivo; pendiente de revisión editorial.' : ''}</small></article>`).join('')}</div></section>`).join('')}</html>`;
  await writeFile(join(output, 'index.html'), html, { flag: 'wx' });
  await writeFile(join(output, 'LEEME.txt'), `EXTRACCIÓN WORDPRESS · TONI CRESPO\nFecha: ${startedAt}\nFuente: ${ORIGIN}\nEstado: ${report.status}\n\nAbre index.html para navegar sin conexión. Cada imagen tiene una ficha TXT y otra JSON con procedencia, texto original, medidas explícitas, resolución y SHA-256. catalogo.csv se abre en Excel/LibreOffice (UTF-8, separador punto y coma). catalogo.json conserva todos los datos.\n\nALCANCE\n${records.length} referencias de obra de ${report.collections.length} colecciones públicas. ${report.counts.uniqueFilesBySha256} imágenes distintas por contenido. Se conservan las repeticiones entre colecciones. Se han consultado todas las páginas de la API y la paginación detectada de cada galería. Se intenta descargar el original señalado por WordPress, sin reescalar ni procesar las imágenes; si no está accesible, se usa la versión publicada y se registra el intento.\n\nNO ES UNA COPIA COMPLETA DE WORDPRESS\nNo incluye usuarios, contraseñas, comentarios, borradores, noticias, fotografías documentales, ni toda la biblioteca de medios. El XML tonicrespo.WordPress.2026-06-30.xml y los antiguos extractores ya no existen en este repositorio ni en su historial accesible. El inventario histórico conserva 196 obras, mientras que el antiguo WXR registraba 290 objetos NextGEN (no equivalen necesariamente a 290 obras públicas distintas). MONOCROMÍAS figura sin imágenes en la web pública y en la extracción anterior. Para recuperar sus obras o contenido borrado/privado hace falta el XML original y, preferentemente, una copia de la base de datos con tablas NextGEN y wp-content/uploads + wp-content/gallery del WordPress antiguo. No se requiere compartir contraseñas para esta extracción pública.\n\nCALIDAD DE LOS METADATOS\nSe mantienen los títulos y textos publicados, incluso si parecen nombres de archivo o contienen errores originales. No se inventan títulos, técnicas ni medidas. Las dimensiones de la fotografía en píxeles NO son las medidas del cuadro. Hay ${report.counts.titlesNeedingReview} títulos marcados para revisión editorial. Se conserva el inventario anterior y sus referencias no encontradas por separado; no se confunde ese inventario con la publicación actual.\n\nCOMPROBACIÓN\nFallos: ${report.failures.length}. Referencias históricas no encontradas: ${report.historicalMissing.length}. Consulta informe.json y fuentes/. Cada descarga se ha decodificado como imagen y tiene checksum SHA-256. La extracción no modifica WordPress, Supabase ni el frontend, y no envía correos.\n\nCOLECCIONES\n${report.collections.map(c => `${c.title}: ${c.artworkCount}${c.emptyGallery ? ' (galería pública vacía)' : ''}`).join('\n')}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, status: report.status, ...report.counts }, null, 2));
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  dom = await context.newPage();
  const historicalText = await readFile(join(ROOT, 'context/obras.md'), 'utf8');
  const historical = historicalText.split('\n## Fotografia')[0].split('\n').filter(line => line.startsWith('| ') && line.includes('https://www.tonicrespo.com/')).map(line => {
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    return { recordType: Number(cells[2]) > 0 ? 'artwork' : 'empty_collection', collection: cells[0], collectionSlug: cells[1], order: cells[2], title: cells[3], caption: cells[5], description: cells[6], technique: cells[7], dimensions: cells[8], sourceImageUrl: cells[10], historicalId: cells[14] };
  }).filter(row => row.sourceImageUrl?.startsWith(ORIGIN));
  await saveJSON('fuentes/inventario-historico-2026-08-07.json', historical);
  await writeFile(join(output, 'fuentes/inventario-historico-2026-08-07.md'), historicalText, { flag: 'wx' });
  const pages = await listApi('pages', 'id,slug,link,title,content,modified_gmt');
  await saveJSON('fuentes/paginas-publicas.json', pages);
  const index = pages.find(page => page.slug === 'obra');
  if (!index) throw new Error('No se encuentra el índice de obras publicado.');
  const parsedIndex = await dom.evaluate(parseArtworkPage, { html: index.content.rendered, sourceUrl: index.link, contentOnly: true });
  const links = new Set(parsedIndex.collectionLinks.map(link => urlKey(link.url)));
  const oldNames = new Set(historical.map(row => slug(row.collection)));
  // The preserved inventory can also identify collection pages omitted from the current index.
  const collections = [];
  for (const page of pages) if (links.has(urlKey(page.link)) || oldNames.has(slug(await textFromHtml(page.title.rendered)))) collections.push(page);
  const selectedPaths = new Set(collections.map(page => urlKey(page.link)));
  const selectedNames = new Set(await Promise.all(collections.map(async page => slug(await textFromHtml(page.title.rendered)))));
  if ([...oldNames].some(name => !selectedNames.has(name)) || [...links].some(path => !selectedPaths.has(path))) throw new Error('Faltan páginas de colección respecto al índice o al inventario histórico.');
  console.log(`WordPress: ${pages.length} páginas públicas; ${collections.length} colecciones identificadas.`);
  const jobs = [];
  for (const page of collections) {
    const data = await extractCollection(page, jobs.length + 1);
    jobs.push(data);
  }
  // The site's media listing advertises 322 entries but returns only 152.
  // Resolve every explicit wp-image-ID instead of trusting that incomplete list.
  const mediaIds = new Set(jobs.flatMap(job => job.artworks.map(a => a.wordpressMediaId).filter(Boolean)));
  const byId = new Map();
  for (const id of mediaIds) {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('ID de medio no válido.');
    try {
      const response = await fetchPublic(`${ORIGIN}/wp-json/wp/v2/media/${id}?_fields=id,slug,source_url,title,caption,description,alt_text,media_details,mime_type`);
      const item = JSON.parse(response.data.toString('utf8'));
      if (item.id !== Number(id) || !item.source_url) throw new Error('La ficha de medio no coincide con el ID solicitado.');
      safeUrl(item.source_url);
      byId.set(String(item.id), item);
      await saveJSON(`fuentes/medios/${item.id}.json`, item);
    } catch (error) { report.failures.push({ stage: 'media_metadata', id, error: error.message }); }
  }
  console.log(`Fichas de medios resueltas por ID: ${byId.size}/${mediaIds.size}.`);
  await saveJSON('fuentes/medios-de-obras.json', [...byId.values()]);
  for (const row of historical.filter(item => item.recordType === 'artwork')) {
    const job = jobs.find(candidate => slug(candidate.collection.title) === slug(row.collection));
    // Check membership as well as the image: appearance in another collection
    // must not hide a missing historical reference. WP may render a thumbnail.
    const found = job?.artworks.some(a => urlKey(a.imageUrl) === urlKey(row.sourceImageUrl)
      || (a.wordpressMediaId && byId.get(String(a.wordpressMediaId))?.source_url
        && urlKey(byId.get(String(a.wordpressMediaId)).source_url) === urlKey(row.sourceImageUrl)));
    if (!found) report.historicalMissing.push(row);
  }
  for (const { collection, artworks } of jobs) {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(2, artworks.length) }, async () => {
      while (next < artworks.length) {
        const position = next++;
        const artwork = artworks[position];
        // Only a verified wp-image-ID links artwork metadata to a media entry.
        // Matching filenames alone cannot establish that two paintings are the same.
        const item = byId.get(String(artwork.wordpressMediaId)) ?? null;
        try {
          const record = await downloadArtwork(artwork, collection, position + 1, item);
          records.push(record);
          if (records.length % 20 === 0) console.log(`${records.length} imágenes descargadas y decodificadas.`);
        } catch (error) { report.failures.push({ collection: collection.title, imageUrl: artwork.imageUrl, error: error.message }); }
      }
    }));
  }
} catch (error) {
  report.failures.push({ stage: 'extraction', error: error.message });
  console.error(error.message);
} finally {
  await browser?.close();
  await finish();
  if (report.status === 'partial') process.exitCode = 1;
}
