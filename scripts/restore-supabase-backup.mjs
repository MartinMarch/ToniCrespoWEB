import fs from "node:fs";
import path from "node:path";
import {
  CONTENT_TABLES,
  REQUIRED_SITE_BUCKETS,
  assertKnownArgs,
  assertSupabaseSuccess,
  chunk,
  contextualSchemaGuidance,
  createSupabaseClient,
  findLatestSnapshotDirectory,
  getOption,
  getServiceSupabaseConfig,
  getSnapshotStorageFilePath,
  inspectContextualEditingSchema,
  readJsonFile,
  readSnapshotManifest,
  resolveSnapshotDirectory,
  rewriteSnapshotStorageUrls,
  sha256,
} from "./lib/supabaseSnapshotUtils.mjs";

const args = process.argv.slice(2);
assertKnownArgs(args, { flags: ["--latest", "--write"], options: ["--from"] });

const shouldWrite = args.includes("--write");
const useLatest = args.includes("--latest");
const fromOption = getOption(args, "--from");

if (useLatest && fromOption) {
  throw new Error("Usa --latest o --from, pero no ambos.");
}

if (!useLatest && !fromOption) {
  throw new Error("Indica --from supabase/backups/<snapshot> o usa --latest.");
}

const snapshotDirectory = useLatest ? findLatestSnapshotDirectory() : resolveSnapshotDirectory(fromOption);
const manifest = readSnapshotManifest(snapshotDirectory);

await main();

async function main() {
  const databaseTables = manifest.database?.tables ?? [];
  const storageBuckets = manifest.storage?.buckets ?? [];
  const rowCount = databaseTables.reduce((total, table) => total + Number(table.rowCount ?? 0), 0);
  const fileCount = storageBuckets.reduce((total, bucket) => total + Number(bucket.fileCount ?? 0), 0);

  console.log(`Snapshot: ${path.relative(process.cwd(), snapshotDirectory)}`);
  console.log(`Origen: ${manifest.source?.supabaseUrl ?? "desconocido"}`);
  console.log(`Contenido: ${rowCount} filas y ${fileCount} archivos.`);

  if (!shouldWrite) {
    console.log("Vista previa completada. No se ha modificado Supabase.");
    console.log("Para restaurar mediante upsert, repite el comando añadiendo --write.");
    return;
  }

  const config = getServiceSupabaseConfig();
  const client = createSupabaseClient(config.url, config.serviceRoleKey);
  const schemaStatus = await inspectContextualEditingSchema(client);

  if (!schemaStatus.ready) {
    throw new Error(contextualSchemaGuidance(schemaStatus));
  }

  await ensureTargetBuckets(client, storageBuckets);
  await restoreStorage(client, storageBuckets);
  await restoreDatabase(client, databaseTables, manifest.source?.supabaseUrl, config.url);

  const authUsers = readOptionalJson(path.join(snapshotDirectory, "auth", "admin-users.json"));
  const adminGrants = databaseTables.find((table) => table.name === "admin_users")?.rowCount ?? 0;

  console.log("Restauración completada mediante upsert: no se ha borrado ningún dato existente en el proyecto destino.");
  console.log(`Permisos admin restaurados: ${adminGrants}. Cuentas Auth documentadas: ${Array.isArray(authUsers) ? authUsers.length : 0}.`);
  console.log("Las cuentas Auth y sus contraseñas no se restauran: créalas o recupéralas desde Supabase Auth y conserva sus emails en admin_users.");
}

async function ensureTargetBuckets(client, sourceBuckets) {
  const targetBuckets = assertSupabaseSuccess(await client.storage.listBuckets(), "No se pudieron listar los buckets del proyecto destino");
  const byId = new Map(targetBuckets.map((bucket) => [bucket.id, bucket]));
  const missingRequired = REQUIRED_SITE_BUCKETS.filter((bucket) => !byId.has(bucket));

  if (missingRequired.length > 0) {
    throw new Error(
      `Faltan buckets esenciales (${missingRequired.join(", ")}). Ejecuta primero todas las migraciones de supabase/migrations en el proyecto destino.`,
    );
  }

  const nonPublicRequired = REQUIRED_SITE_BUCKETS.filter((bucket) => byId.get(bucket)?.public !== true);
  if (nonPublicRequired.length > 0) {
    throw new Error(
      `Los buckets esenciales deben ser públicos (${nonPublicRequired.join(", ")}). Reaplica las migraciones antes de restaurar.`,
    );
  }

  for (const bucket of sourceBuckets) {
    if (byId.has(bucket.id)) continue;

    const { error } = await client.storage.createBucket(bucket.id, {
      public: Boolean(bucket.public),
    });
    if (error) throw new Error(`No se pudo crear el bucket adicional ${bucket.id}: ${error.message}`);
    console.log(`  Bucket adicional creado: ${bucket.id}`);
  }
}

async function restoreStorage(client, buckets) {
  for (const bucket of buckets) {
    const files = bucket.files ?? [];
    console.log(`  Restaurando Storage: ${bucket.id} (${files.length} archivos)`);

    for (const file of files) {
      const localFile = getSnapshotStorageFilePath(snapshotDirectory, bucket.id, file.path);
      if (!fs.existsSync(localFile)) {
        throw new Error(`Falta el activo local del snapshot: ${path.relative(process.cwd(), localFile)}`);
      }

      const bytes = fs.readFileSync(localFile);
      if (file.sha256 && sha256(bytes) !== file.sha256) {
        throw new Error(`La suma de verificación no coincide para ${bucket.id}/${file.path}.`);
      }

      const { error } = await client.storage.from(bucket.id).upload(file.path, bytes, {
        cacheControl: file.cacheControl || "31536000",
        contentType: file.contentType || "application/octet-stream",
        upsert: true,
      });
      if (error) throw new Error(`No se pudo restaurar ${bucket.id}/${file.path}: ${error.message}`);
    }
  }
}

async function restoreDatabase(client, snapshotTables, sourceUrl, targetUrl) {
  if (typeof sourceUrl !== "string" || !sourceUrl) {
    throw new Error("El manifest no indica el proyecto Supabase de origen.");
  }

  const tableFiles = new Map(snapshotTables.map((table) => [table.name, table.file]));

  for (const table of CONTENT_TABLES) {
    const file = tableFiles.get(table.name);
    if (typeof file !== "string") {
      throw new Error(`El snapshot no contiene una copia de la tabla ${table.name}.`);
    }

    const rows = readJsonFile(path.join(snapshotDirectory, file));
    if (!Array.isArray(rows)) {
      throw new Error(`La copia de ${table.name} no contiene una lista de filas válida.`);
    }

    console.log(`  Restaurando base de datos: ${table.name} (${rows.length} filas)`);
    const rewrittenRows = rows.map((row) => rewriteSnapshotStorageUrls(row, sourceUrl, targetUrl));

    for (const batch of chunk(rewrittenRows, 100)) {
      if (batch.length === 0) continue;

      const { error } = await client.from(table.name).upsert(batch, {
        onConflict: table.conflict,
      });
      if (error) throw new Error(`No se pudo restaurar ${table.name}: ${error.message}`);
    }
  }
}

function readOptionalJson(filePath) {
  return fs.existsSync(filePath) ? readJsonFile(filePath) : null;
}
