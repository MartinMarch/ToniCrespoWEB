import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

export const ROOT_DIR = process.cwd();
export const BACKUPS_ROOT = path.join(ROOT_DIR, "supabase", "backups");
export const SNAPSHOT_FORMAT = "tonicrespo-supabase-snapshot";
export const SNAPSHOT_VERSION = 1;

export const CONTENT_TABLES = Object.freeze([
  { name: "site_pages", conflict: "id" },
  { name: "collections", conflict: "id" },
  { name: "artworks", conflict: "id" },
  { name: "photography_items", conflict: "id" },
  { name: "news_items", conflict: "id" },
  { name: "news_item_images", conflict: "id" },
  { name: "admin_users", conflict: "email" },
]);

export const EDITABLE_TABLES = Object.freeze(CONTENT_TABLES.filter((table) => table.name !== "admin_users"));
export const REQUIRED_SITE_BUCKETS = Object.freeze(["artworks", "photography", "news", "biography", "site-assets"]);

export function readProjectEnv() {
  return {
    ...readEnvFile(path.join(ROOT_DIR, ".env")),
    ...process.env,
  };
}

export function getPublicSupabaseConfig(env = readProjectEnv()) {
  const url = normalizeSupabaseUrl(firstValue(env.VITE_SUPABASE_URL, env.SUPABASE_URL, env.SUPABASE_TEST_URL));
  const anonKey = firstValue(env.VITE_SUPABASE_ANON_KEY, env.SUPABASE_ANON_KEY, env.SUPABASE_TEST_ANON_KEY);

  if (!url || !anonKey) {
    throw new Error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.");
  }

  return { anonKey, url };
}

export function getServiceSupabaseConfig(env = readProjectEnv()) {
  const publicConfig = getPublicSupabaseConfig(env);
  const serviceRoleKey = firstValue(
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.SUPABASE_SECRET_KEY,
    env.SUPABASE_SERVICE_KEY,
    env.SERVICE_ROLE_KEY,
    env.SUPABASE_TEST_SERVICE_ROLE_KEY,
    env.SUPABASE_TEST_SECRET_KEY,
  );

  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env. Esta clave solo se usa desde scripts Node y nunca se expone al navegador.",
    );
  }

  return { ...publicConfig, serviceRoleKey };
}

export function createSupabaseClient(url, key) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    realtime: {
      transport: resolveWebSocketTransport(),
    },
  });
}

export function createSnapshotId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function resolveBackupDirectory(value) {
  const requested = value || path.join("supabase", "backups", createSnapshotId());
  const directory = path.resolve(ROOT_DIR, requested);

  if (!isPathInside(BACKUPS_ROOT, directory)) {
    throw new Error("La copia debe guardarse dentro de supabase/backups para no sobrescribir archivos del proyecto.");
  }

  return directory;
}

export function findLatestSnapshotDirectory() {
  if (!fs.existsSync(BACKUPS_ROOT)) {
    throw new Error("No existe supabase/backups. Ejecuta primero npm run backup:supabase.");
  }

  const snapshots = fs
    .readdirSync(BACKUPS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.includes(".partial"))
    .map((entry) => path.join(BACKUPS_ROOT, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, "manifest.json")))
    .sort((left, right) => right.localeCompare(left));

  if (snapshots.length === 0) {
    throw new Error("No hay snapshots completos en supabase/backups.");
  }

  return snapshots[0];
}

export function resolveSnapshotDirectory(value) {
  const directory = path.resolve(ROOT_DIR, value);

  if (!isPathInside(BACKUPS_ROOT, directory)) {
    throw new Error("El snapshot debe estar dentro de supabase/backups.");
  }

  return directory;
}

export function readSnapshotManifest(snapshotDirectory) {
  const manifest = readJsonFile(path.join(snapshotDirectory, "manifest.json"));

  if (!manifest || manifest.format !== SNAPSHOT_FORMAT || manifest.version !== SNAPSHOT_VERSION) {
    throw new Error(`El snapshot ${snapshotDirectory} no tiene un manifest compatible.`);
  }

  return manifest;
}

export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`No existe el archivo requerido: ${path.relative(ROOT_DIR, filePath)}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function copyLocalMigrationFiles(targetDirectory) {
  const migrationsDirectory = path.join(ROOT_DIR, "supabase", "migrations");
  const migrationNames = fs.existsSync(migrationsDirectory)
    ? fs
        .readdirSync(migrationsDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
        .map((entry) => entry.name)
        .sort()
    : [];

  return migrationNames.map((name) => {
    const source = path.join(migrationsDirectory, name);
    const target = path.join(targetDirectory, "schema", "migrations", name);
    const contents = fs.readFileSync(source);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);

    return {
      name,
      sha256: sha256(contents),
    };
  });
}

export async function fetchAllRows(client, table, pageSize = 1000) {
  const rows = [];
  let offset = 0;

  while (true) {
    let query = client.from(table).select("*").range(offset, offset + pageSize - 1);
    query = table === "admin_users" ? query.order("email", { ascending: true }) : query.order("id", { ascending: true });

    const { data, error } = await query;
    if (error) throw new Error(`No se pudo leer ${table}: ${error.message}`);

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
    offset += page.length;
  }

  return rows;
}

export async function fetchAdminAuthMetadata(client, adminRows) {
  const adminEmails = new Set(
    adminRows
      .map((row) => String(row.email ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  if (adminEmails.size === 0) return [];

  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`No se pudieron leer los usuarios Auth: ${error.message}`);

    const currentUsers = data?.users ?? [];
    for (const user of currentUsers) {
      const email = String(user.email ?? "").trim().toLowerCase();
      if (!adminEmails.has(email)) continue;

      users.push({
        id: user.id,
        email: user.email ?? null,
        emailConfirmedAt: user.email_confirmed_at ?? null,
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
        role: user.role ?? null,
      });
    }

    if (currentUsers.length < perPage) break;
    page += 1;
  }

  return users.sort((left, right) => String(left.email).localeCompare(String(right.email)));
}

export async function inspectContextualEditingSchema(client) {
  const tables = await Promise.all(
    EDITABLE_TABLES.map(async ({ name }) => {
      const { error } = await client.from(name).select("id,translations").limit(1);
      return {
        name,
        ready: !error,
        message: error?.message ?? null,
      };
    }),
  );

  const zeroUuid = "00000000-0000-0000-0000-000000000000";
  const { error: functionError } = await client.rpc("delete_artwork_with_cover_refresh", {
    target_artwork_id: zeroUuid,
  });
  const functionMissing = Boolean(functionError && /PGRST202|Could not find the function|function .* does not exist/i.test(functionError.message));
  const functionDenied = Boolean(functionError && /permission denied|not authorized/i.test(functionError.message));
  const functionReady = !functionMissing && !functionDenied;

  return {
    function: {
      ready: functionReady,
      message: functionError?.message ?? null,
    },
    ready: tables.every((table) => table.ready) && functionReady,
    tables,
  };
}

export function contextualSchemaGuidance(status) {
  const failedTables = status.tables.filter((table) => !table.ready).map((table) => table.name);
  const details = [
    ...failedTables,
    ...(status.function.ready ? [] : ["delete_artwork_with_cover_refresh"]),
  ];
  const suffix = details.length > 0 ? ` Faltan o no son accesibles: ${details.join(", ")}.` : "";

  return "La base de datos no tiene aplicada la migración de edición contextual. Ejecuta supabase/migrations/20260811110000_contextual_editing.sql en el SQL Editor de Supabase y vuelve a intentarlo." + suffix;
}

export async function listAllStorageObjects(client, bucket) {
  const files = [];
  const seenDirectories = new Set();
  const seenFiles = new Set();

  async function visitDirectory(prefix) {
    if (seenDirectories.has(prefix)) return;
    seenDirectories.add(prefix);

    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: pageSize,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`No se pudo listar ${bucket}/${prefix}: ${error.message}`);

      const entries = data ?? [];
      for (const entry of entries) {
        if (!entry.name) continue;

        const storagePath = joinStoragePath(prefix, entry.name);
        if (isStorageDirectory(entry)) {
          await visitDirectory(storagePath);
          continue;
        }

        if (seenFiles.has(storagePath)) continue;
        seenFiles.add(storagePath);
        files.push({
          createdAt: entry.created_at ?? null,
          metadata: entry.metadata ?? {},
          path: storagePath,
          updatedAt: entry.updated_at ?? null,
        });
      }

      if (entries.length < pageSize) break;
      offset += entries.length;
    }
  }

  await visitDirectory("");
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function downloadStorageObject(client, bucket, storagePath) {
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  if (error) throw new Error(`No se pudo descargar ${bucket}/${storagePath}: ${error.message}`);

  if (Buffer.isBuffer(data)) return data;
  if (data && typeof data.arrayBuffer === "function") {
    return Buffer.from(await data.arrayBuffer());
  }

  throw new Error(`Supabase no devolvió un archivo válido para ${bucket}/${storagePath}.`);
}

export function getSnapshotStorageFilePath(snapshotDirectory, bucket, storagePath) {
  const bucketDirectory = path.join(snapshotDirectory, "storage", assertSafeBucketName(bucket));
  const safePath = assertSafeStoragePath(storagePath);
  const target = path.join(bucketDirectory, ...safePath.split("/"));

  if (!isPathInside(bucketDirectory, target)) {
    throw new Error(`Ruta de Storage no válida: ${storagePath}`);
  }

  return target;
}

export function getStorageContentType(filePath, metadata = {}) {
  const declared = metadata.mimetype ?? metadata.contentType;
  if (typeof declared === "string" && declared) return declared;

  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".avif": "image/avif",
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".webp": "image/webp",
  };

  return mimeTypes[extension] ?? "application/octet-stream";
}

export function getStorageCacheControl(metadata = {}) {
  const value = metadata.cacheControl ?? metadata.cache_control;
  return typeof value === "string" && value ? value : "31536000";
}

export function rewriteSnapshotStorageUrls(value, sourceUrl, targetUrl) {
  const sourcePrefix = `${stripTrailingSlash(sourceUrl)}/storage/v1/object/public/`;
  const targetPrefix = `${stripTrailingSlash(targetUrl)}/storage/v1/object/public/`;

  if (typeof value === "string") {
    return value.split(sourcePrefix).join(targetPrefix);
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteSnapshotStorageUrls(item, sourceUrl, targetUrl));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteSnapshotStorageUrls(item, sourceUrl, targetUrl)]),
    );
  }

  return value;
}

export function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertSupabaseSuccess(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.data;
}

export function getOption(args, option) {
  const inline = args.find((argument) => argument.startsWith(`${option}=`));
  if (inline) return inline.slice(option.length + 1);

  const index = args.indexOf(option);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} necesita una ruta.`);
  }

  return value;
}

export function assertKnownArgs(args, { flags = [], options = [] }) {
  const allowedFlags = new Set(flags);
  const allowedOptions = new Set(options);

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw new Error(`Argumento no reconocido: ${argument}`);

    const option = argument.includes("=") ? argument.slice(0, argument.indexOf("=")) : argument;
    if (allowedFlags.has(option)) continue;
    if (!allowedOptions.has(option)) throw new Error(`Argumento no reconocido: ${argument}`);

    if (!argument.includes("=")) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${option} necesita un valor.`);
      index += 1;
    }
  }
}

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .flatMap((line) => {
        const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
        const separator = normalized.indexOf("=");
        if (separator <= 0) return [];
        return [[normalized.slice(0, separator), unquote(normalized.slice(separator + 1))]];
      }),
  );
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function firstValue(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function normalizeSupabaseUrl(value) {
  if (!value) return "";

  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    throw new Error("VITE_SUPABASE_URL no contiene una URL válida.");
  }
}

function resolveWebSocketTransport() {
  if (typeof globalThis.WebSocket === "function") return globalThis.WebSocket;
  return WebSocket;
}

function isStorageDirectory(entry) {
  return !entry.id;
}

function joinStoragePath(prefix, name) {
  const segments = [prefix, name].filter(Boolean);
  return assertSafeStoragePath(segments.join("/"));
}

function assertSafeBucketName(bucket) {
  if (!/^[A-Za-z0-9_-]+$/.test(bucket)) {
    throw new Error(`Nombre de bucket no válido: ${bucket}`);
  }

  return bucket;
}

function assertSafeStoragePath(storagePath) {
  const normalized = String(storagePath).replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (!normalized || normalized.startsWith("/") || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Ruta de Storage no válida: ${storagePath}`);
  }

  return segments.join("/");
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

function isPathInside(parent, target) {
  const relative = path.relative(parent, target);
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}
