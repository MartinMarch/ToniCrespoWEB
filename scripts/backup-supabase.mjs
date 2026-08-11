import fs from "node:fs";
import path from "node:path";
import {
  CONTENT_TABLES,
  SNAPSHOT_FORMAT,
  SNAPSHOT_VERSION,
  assertKnownArgs,
  assertSupabaseSuccess,
  contextualSchemaGuidance,
  copyLocalMigrationFiles,
  createSupabaseClient,
  downloadStorageObject,
  fetchAdminAuthMetadata,
  fetchAllRows,
  getOption,
  getServiceSupabaseConfig,
  getSnapshotStorageFilePath,
  getStorageCacheControl,
  getStorageContentType,
  inspectContextualEditingSchema,
  listAllStorageObjects,
  resolveBackupDirectory,
  sha256,
  writeJsonFile,
} from "./lib/supabaseSnapshotUtils.mjs";

const args = process.argv.slice(2);
assertKnownArgs(args, { flags: ["--overwrite"], options: ["--output"] });

const outputDirectory = resolveBackupDirectory(getOption(args, "--output"));
const shouldOverwrite = args.includes("--overwrite");
const stagingDirectory = `${outputDirectory}.partial-${process.pid}`;

await main();

async function main() {
  if (fs.existsSync(outputDirectory) && !shouldOverwrite) {
    throw new Error(
      `Ya existe ${path.relative(process.cwd(), outputDirectory)}. Elige otra ruta o añade --overwrite para reemplazar solo esa copia local.`,
    );
  }

  if (fs.existsSync(stagingDirectory)) {
    throw new Error(`Existe una copia parcial anterior: ${path.relative(process.cwd(), stagingDirectory)}.`);
  }

  const config = getServiceSupabaseConfig();
  const client = createSupabaseClient(config.url, config.serviceRoleKey);

  fs.mkdirSync(stagingDirectory, { recursive: true });

  try {
    console.log(`Origen Supabase: ${new URL(config.url).host}`);
    console.log(`Destino local: ${path.relative(process.cwd(), outputDirectory)}`);

    const schemaStatus = await inspectContextualEditingSchema(client);
    if (!schemaStatus.ready) {
      console.warn(`Aviso de esquema: ${contextualSchemaGuidance(schemaStatus)}`);
      console.warn("La copia continuará para preservar el estado remoto actual.");
    }

    const tables = [];
    const rowsByTable = new Map();

    for (const table of CONTENT_TABLES) {
      const rows = await fetchAllRows(client, table.name);
      rowsByTable.set(table.name, rows);
      writeJsonFile(path.join(stagingDirectory, "database", `${table.name}.json`), rows);
      tables.push({
        file: `database/${table.name}.json`,
        name: table.name,
        rowCount: rows.length,
      });
      console.log(`  Base de datos: ${table.name} (${rows.length} filas)`);
    }

    const adminAuthMetadata = await fetchAdminAuthMetadata(client, rowsByTable.get("admin_users") ?? []);
    writeJsonFile(path.join(stagingDirectory, "auth", "admin-users.json"), adminAuthMetadata);
    console.log(`  Auth: ${adminAuthMetadata.length} administradores documentados sin credenciales`);

    const buckets = assertSupabaseSuccess(await client.storage.listBuckets(), "No se pudieron listar los buckets de Storage");
    const storageBuckets = [];

    for (const bucket of [...buckets].sort((left, right) => left.id.localeCompare(right.id))) {
      const objects = await listAllStorageObjects(client, bucket.id);
      const files = [];
      let byteCount = 0;

      console.log(`  Storage: ${bucket.id} (${objects.length} archivos)`);

      for (const object of objects) {
        const bytes = await downloadStorageObject(client, bucket.id, object.path);
        const filePath = getSnapshotStorageFilePath(stagingDirectory, bucket.id, object.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, bytes);

        byteCount += bytes.byteLength;
        files.push({
          ...object,
          cacheControl: getStorageCacheControl(object.metadata),
          contentType: getStorageContentType(object.path, object.metadata),
          sha256: sha256(bytes),
          size: bytes.byteLength,
        });
      }

      storageBuckets.push({
        fileCount: files.length,
        files,
        id: bucket.id,
        name: bucket.name ?? bucket.id,
        public: Boolean(bucket.public),
        size: byteCount,
      });
    }

    const migrations = copyLocalMigrationFiles(stagingDirectory);
    const manifest = {
      auth: {
        file: "auth/admin-users.json",
        note: "Solo contiene metadatos de administradores. Supabase nunca expone contraseñas ni sesiones para una copia.",
        userCount: adminAuthMetadata.length,
      },
      createdAt: new Date().toISOString(),
      database: { tables },
      format: SNAPSHOT_FORMAT,
      schema: {
        contextualEditing: schemaStatus,
        migrationFiles: migrations,
      },
      source: {
        supabaseUrl: config.url,
      },
      storage: { buckets: storageBuckets },
      version: SNAPSHOT_VERSION,
    };

    writeJsonFile(path.join(stagingDirectory, "manifest.json"), manifest);
    if (fs.existsSync(outputDirectory)) {
      fs.rmSync(outputDirectory, { force: true, recursive: true });
    }
    fs.renameSync(stagingDirectory, outputDirectory);

    const totalFiles = storageBuckets.reduce((total, bucket) => total + bucket.fileCount, 0);
    const totalBytes = storageBuckets.reduce((total, bucket) => total + bucket.size, 0);
    console.log(`Copia completada: ${tables.reduce((total, table) => total + table.rowCount, 0)} filas y ${totalFiles} archivos (${formatBytes(totalBytes)}).`);
    console.log(`Snapshot: ${path.relative(process.cwd(), outputDirectory)}`);
  } catch (error) {
    fs.rmSync(stagingDirectory, { force: true, recursive: true });
    throw error;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
