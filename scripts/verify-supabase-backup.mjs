import fs from "node:fs";
import path from "node:path";
import {
  CONTENT_TABLES,
  assertKnownArgs,
  findLatestSnapshotDirectory,
  getOption,
  getSnapshotStorageFilePath,
  readJsonFile,
  readSnapshotManifest,
  resolveSnapshotDirectory,
  sha256,
} from "./lib/supabaseSnapshotUtils.mjs";

const args = process.argv.slice(2);
assertKnownArgs(args, { flags: ["--latest"], options: ["--from"] });

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
const failures = [];

for (const table of CONTENT_TABLES) {
  const tableManifest = manifest.database?.tables?.find((candidate) => candidate.name === table.name);
  if (!tableManifest?.file) {
    failures.push(`Falta ${table.name} en el manifest.`);
    continue;
  }

  try {
    const rows = readJsonFile(path.join(snapshotDirectory, tableManifest.file));
    if (!Array.isArray(rows)) {
      failures.push(`${table.name} no contiene una lista de filas.`);
    } else if (rows.length !== tableManifest.rowCount) {
      failures.push(`${table.name} declara ${tableManifest.rowCount} filas, pero contiene ${rows.length}.`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

for (const migration of manifest.schema?.migrationFiles ?? []) {
  const migrationPath = path.join(snapshotDirectory, "schema", "migrations", migration.name);
  if (!fs.existsSync(migrationPath)) {
    failures.push(`Falta la migración copiada ${migration.name}.`);
    continue;
  }

  if (migration.sha256 && sha256(fs.readFileSync(migrationPath)) !== migration.sha256) {
    failures.push(`La migración ${migration.name} no coincide con su suma de verificación.`);
  }
}

let fileCount = 0;
let byteCount = 0;

for (const bucket of manifest.storage?.buckets ?? []) {
  const files = bucket.files ?? [];
  if (files.length !== bucket.fileCount) {
    failures.push(`El bucket ${bucket.id} declara ${bucket.fileCount} archivos, pero el manifest lista ${files.length}.`);
  }

  for (const file of files) {
    try {
      const filePath = getSnapshotStorageFilePath(snapshotDirectory, bucket.id, file.path);
      if (!fs.existsSync(filePath)) {
        failures.push(`Falta ${bucket.id}/${file.path}.`);
        continue;
      }

      const bytes = fs.readFileSync(filePath);
      fileCount += 1;
      byteCount += bytes.byteLength;

      if (file.size !== bytes.byteLength) {
        failures.push(`${bucket.id}/${file.path} tiene un tamaño inesperado.`);
      }
      if (file.sha256 && sha256(bytes) !== file.sha256) {
        failures.push(`${bucket.id}/${file.path} no coincide con su suma de verificación.`);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
}

const authPath = path.join(snapshotDirectory, manifest.auth?.file ?? "auth/admin-users.json");
if (!fs.existsSync(authPath)) {
  failures.push("Falta la copia de metadatos de administradores.");
}

if (failures.length > 0) {
  console.error(`El snapshot ${path.relative(process.cwd(), snapshotDirectory)} no es íntegro:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Snapshot íntegro: ${path.relative(process.cwd(), snapshotDirectory)}`);
  console.log(`${fileCount} archivos y ${formatBytes(byteCount)} verificados mediante SHA-256.`);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
