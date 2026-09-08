import { pathToFileURL } from "node:url";
import { readProjectEnv } from "../../scripts/lib/supabaseSnapshotUtils.mjs";

const TABLES = Object.freeze({
  site_pages: "id,kind,html,content,is_published,translations",
  collections: "id,cover_image_url,is_published,translations",
  artworks: "id,collection_id,image_url,thumbnail_url,sort_order,description,is_published,translations",
  photography_items: "id,image_url,is_published,translations",
  news_items: "id,image_url,is_published,published_at,translations",
  news_item_images: "id,news_item_id,image_url,translations",
  site_settings: "key,value",
  admin_users: "created_at",
});
const EMAIL_PATH = "/functions/v1/send-contact-email";
const HONEYPOT_BODY = JSON.stringify({ website: "health-check" });

export function publicHealthConfig(env) {
  if (!env.VITE_SUPABASE_URL?.trim() || !env.VITE_SUPABASE_ANON_KEY?.trim()) {
    throw new Error("Se requieren VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY; no se usan claves de servicio.");
  }
  const url = new URL(env.VITE_SUPABASE_URL);
  const key = env.VITE_SUPABASE_ANON_KEY.trim();
  if (url.username || url.password || url.search || url.hash || !["https:", "http:"].includes(url.protocol)) throw new Error("URL pública Supabase no válida.");
  if (key.startsWith("sb_secret_")) throw new Error("La comprobación pública rechaza claves secretas.");
  if (key.split(".").length === 3) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); } catch { throw new Error("Clave anónima JWT no válida."); }
    if (claims.role !== "anon") throw new Error("La comprobación requiere una clave anon, nunca service_role ni una sesión.");
  }
  return { base: url.origin, headers: { apikey: key, ...(key.startsWith("sb_publishable_") ? {} : { Authorization: `Bearer ${key}` }) } };
}

export async function runPublicHealth({ env, fetchImpl = fetch, log = console.log, skipMedia = false, requireEmailFunction = false }) {
  const config = publicHealthConfig(env);
  const deadline = AbortSignal.timeout(240_000);
  const request = async (url, init = {}) => {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.any([deadline, AbortSignal.timeout(12_000)]) });
        if ((response.status !== 429 && response.status < 500) || (init.method === "HEAD" && response.status === 501)) return response;
        await response.body?.cancel();
        last = new Error(`HTTP ${response.status}`);
      } catch (error) { last = error; }
      if (deadline.aborted) throw new Error("La comprobación pública superó el límite de cuatro minutos.");
    }
    throw new Error(`Petición pública fallida en ${new URL(url).pathname}: ${last?.message ?? "error de red"}`);
  };
  const jsonGet = async (path) => {
    const response = await request(`${config.base}${path}`, { method: "GET", headers: config.headers });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`${path.split("?")[0]}: HTTP ${response.status}`); }
    return response.json();
  };
  log(`Supabase público: ${new URL(config.base).host} (sólo lectura)`);
  if (await jsonGet("/rest/v1/rpc/is_admin") !== false) throw new Error("is_admin debe devolver false con la clave pública.");
  const data = {};
  for (const [table, select] of Object.entries(TABLES)) {
    const rows = [];
    for (let page = 0; ; page++) {
      if (page >= 40) throw new Error(`${table}: se excedió el límite de 20.000 filas de comprobación.`);
      const params = new URLSearchParams({ select, limit: "500", offset: String(page * 500), order: `${table === "site_settings" ? "key" : table === "admin_users" ? "created_at" : "id"}.asc` });
      if (table === "site_settings") params.set("key", "eq.global");
      const batch = await jsonGet(`/rest/v1/${table}?${params}`);
      if (!Array.isArray(batch)) throw new Error(`${table}: respuesta no válida.`);
      rows.push(...batch);
      if (batch.length < 500) break;
    }
    if (rows.some((row) => "is_published" in row && row.is_published !== true)) throw new Error(`${table}: RLS permite leer contenido oculto.`);
    data[table] = rows;
    log(`  ok ${table}: ${rows.length} filas públicas`);
  }
  if (data.admin_users.length) throw new Error("La lista de administradores es accesible sin autenticación.");
  for (const kind of ["home", "biography"]) {
    if (!data.site_pages.some((page) => page.kind === kind && page.html?.trim())) throw new Error(`Falta contenido público en ${kind}.`);
  }
  if (!data.news_items.length) throw new Error("No hay noticias públicas; la comprobación de producción requiere contenido real.");
  const settings = data.site_settings.find((row) => row.key === "global")?.value;
  if (!["es", "en", "de", "ca"].includes(settings?.defaultLanguage) || !settings?.contact?.email) throw new Error("Los ajustes globales de idioma/contacto están incompletos.");
  const media = collectRenderedMedia(data);
  if (!skipMedia) {
    const failures = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, media.length) }, async () => {
      while (next < media.length) {
        const url = media[next++];
        try { await checkMedia(url, request); } catch (error) { failures.push(`${safeMediaLabel(url)}: ${error.message}`); }
      }
    }));
    if (failures.length) throw new Error(`Fallan ${failures.length}/${media.length} imágenes:\n${failures.join("\n")}`);
    log(`  ok imágenes renderizadas: ${media.length} URLs únicas, sin descargar archivos completos`);
  } else log(`  omitida comprobación de ${media.length} imágenes (--skip-media; comprobación parcial)`);
  if (requireEmailFunction) {
    const headers = { ...config.headers, "Content-Type": "application/json", ...(env.PUBLIC_HEALTH_ORIGIN ? { Origin: env.PUBLIC_HEALTH_ORIGIN } : {}) };
    const options = await request(`${config.base}${EMAIL_PATH}`, { method: "OPTIONS", headers: { ...headers, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,apikey,content-type" } });
    if (!options.ok) { await options.body?.cancel(); throw new Error(`send-contact-email OPTIONS: HTTP ${options.status}`); }
    if (env.PUBLIC_HEALTH_ORIGIN && !["*", env.PUBLIC_HEALTH_ORIGIN].includes(options.headers.get("access-control-allow-origin"))) {
      await options.body?.cancel();
      throw new Error("send-contact-email no permite el origen público del frontend mediante CORS.");
    }
    await options.body?.cancel();
    const response = await request(`${config.base}${EMAIL_PATH}`, { method: "POST", headers, body: HONEYPOT_BODY });
    if (!response.ok) { await response.body?.cancel(); throw new Error(`send-contact-email honeypot: HTTP ${response.status}; función ausente o correo no configurado.`); }
    if ((await response.json()).ok !== true) throw new Error("La función de correo no confirmó el honeypot.");
    log("  ok función de correo configurada: honeypot sin envío. NO verifica entrega ni credenciales del proveedor.");
  } else log("  correo no comprobado (usar --require-email-function para bloquear el deploy si falta)");
  log("Salud pública correcta. No se modificaron filas, archivos ni usuarios.");
  return { tables: Object.keys(TABLES).length, media: media.length, mediaChecked: !skipMedia, emailChecked: requireEmailFunction };
}

export function collectRenderedMedia(data) {
  const urls = new Set();
  const add = (url) => { if (typeof url === "string" && url.trim()) urls.add(url.trim().replaceAll("&amp;", "&")); };
  const collectionIds = new Set(data.collections.map((row) => row.id));
  const artworks = data.artworks.filter((row) => collectionIds.has(row.collection_id));
  artworks.forEach((row) => add(row.image_url));
  for (const id of collectionIds) {
    const ordered = artworks.filter((row) => row.collection_id === id).sort((a, b) => a.sort_order - b.sort_order);
    const preview = ordered.length <= 3 ? ordered : [ordered[0], ordered[Math.round((ordered.length - 1) / 2)], ordered.at(-1)];
    preview.forEach((row) => add(row.thumbnail_url ?? row.image_url));
  }
  data.photography_items.forEach((row) => add(row.image_url));
  for (const news of data.news_items) {
    const images = data.news_item_images.filter((row) => row.news_item_id === news.id);
    if (images.length) images.forEach((row) => add(row.image_url)); else add(news.image_url);
  }
  for (const page of data.site_pages.filter((row) => ["home", "biography"].includes(row.kind))) {
    if (page.kind === "biography") {
      add(page.content?.mainImageUrl);
      page.content?.galleryImages?.forEach((image) => add(image.url));
    }
    for (const html of [page.html, ...Object.values(page.translations ?? {}).map((translation) => translation.html)]) {
      for (const match of (html ?? "").matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
    }
  }
  return [...urls].sort();
}

export async function checkMedia(value, request) {
  let url;
  try { url = new URL(value); } catch { throw new Error("URL de imagen no absoluta."); }
  if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)) throw new Error("Origen de imagen no público o inseguro.");
  let response = await request(url.href, { method: "HEAD" });
  if ([405, 501].includes(response.status)) {
    await response.body?.cancel();
    response = await request(url.href, { method: "GET", headers: { Range: "bytes=0-63" } });
  }
  await response.body?.cancel();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.toLowerCase().startsWith("image/")) throw new Error("La URL no devuelve una imagen.");
  if (response.headers.get("content-length") === "0") throw new Error("La imagen está vacía.");
}

function safeMediaLabel(value) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return "URL de imagen inválida"; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = new Set(process.argv.slice(2));
  if ([...args].some((arg) => !["--skip-media", "--require-email-function"].includes(arg))) throw new Error("Opciones permitidas: --skip-media, --require-email-function.");
  try {
    await runPublicHealth({ env: process.env.CI ? process.env : readProjectEnv(), skipMedia: args.has("--skip-media"), requireEmailFunction: args.has("--require-email-function") });
  } catch (error) { console.error(`Salud pública fallida: ${error.message}`); process.exitCode = 1; }
}
