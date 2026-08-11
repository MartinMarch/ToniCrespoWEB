import {
  CONTENT_TABLES,
  REQUIRED_SITE_BUCKETS,
  assertKnownArgs,
  assertSupabaseSuccess,
  contextualSchemaGuidance,
  createSupabaseClient,
  fetchAllRows,
  getPublicSupabaseConfig,
  getServiceSupabaseConfig,
  inspectContextualEditingSchema,
  readProjectEnv,
} from "./lib/supabaseSnapshotUtils.mjs";

const args = process.argv.slice(2);
assertKnownArgs(args, { flags: ["--require-service"], options: [] });

await main();

async function main() {
  const env = readProjectEnv();
  const publicConfig = getPublicSupabaseConfig(env);
  const publicClient = createSupabaseClient(publicConfig.url, publicConfig.anonKey);
  const failures = [];

  console.log(`Proyecto Supabase: ${new URL(publicConfig.url).host}`);

  const schemaStatus = await inspectContextualEditingSchema(publicClient);
  if (schemaStatus.ready) {
    console.log("  ok esquema de edición contextual");
  } else {
    failures.push(contextualSchemaGuidance(schemaStatus));
  }

  for (const table of CONTENT_TABLES.filter((candidate) => candidate.name !== "admin_users")) {
    const { count, error } = await publicClient.from(table.name).select("id", { count: "exact", head: true });
    if (error) {
      failures.push(`No se puede leer ${table.name} con la anon key: ${error.message}`);
      continue;
    }

    console.log(`  ok lectura pública ${table.name}: ${count ?? 0} filas visibles`);
  }

  const { error: adminFunctionError } = await publicClient.rpc("is_admin");
  if (adminFunctionError) {
    failures.push(`No se puede comprobar is_admin: ${adminFunctionError.message}`);
  } else {
    console.log("  ok función is_admin");
  }

  let serviceConfig = null;
  try {
    serviceConfig = getServiceSupabaseConfig(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (args.includes("--require-service")) {
      failures.push(message);
    } else {
      console.warn(`  aviso sin comprobación de Storage de servicio: ${message}`);
    }
  }

  if (serviceConfig) {
    const serviceClient = createSupabaseClient(serviceConfig.url, serviceConfig.serviceRoleKey);
    const { count: adminCount, error: adminRowsError } = await serviceClient
      .from("admin_users")
      .select("email", { count: "exact", head: true });
    if (adminRowsError) {
      failures.push(`No se puede leer admin_users con la clave de servicio: ${adminRowsError.message}`);
    } else {
      console.log(`  ok permisos admin: ${adminCount ?? 0} filas`);
    }

    const buckets = assertSupabaseSuccess(await serviceClient.storage.listBuckets(), "No se pudieron listar los buckets de Storage");
    const byId = new Map(buckets.map((bucket) => [bucket.id, bucket]));

    for (const bucketId of REQUIRED_SITE_BUCKETS) {
      const bucket = byId.get(bucketId);
      if (!bucket) {
        failures.push(`Falta el bucket ${bucketId}. Ejecuta las migraciones de supabase/migrations.`);
        continue;
      }
      if (bucket.public !== true) {
        failures.push(`El bucket ${bucketId} debe ser público.`);
        continue;
      }
      console.log(`  ok bucket público ${bucketId}`);
    }

    const localMediaReferences = await findLocalMediaReferences(serviceClient);
    if (localMediaReferences.length > 0) {
      failures.push(
        `Hay ${localMediaReferences.length} referencias a /media-images/ en Supabase. Ejemplos: ${localMediaReferences.slice(0, 3).join(", ")}`,
      );
    } else {
      console.log("  ok no hay referencias a media-images en el contenido remoto");
    }
  }

  if (failures.length === 0) {
    console.log("Supabase está preparado para servir y editar el contenido de la web.");
    return;
  }

  console.error("Supabase necesita atención:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

async function findLocalMediaReferences(client) {
  const references = [];

  for (const table of CONTENT_TABLES.filter((candidate) => candidate.name !== "admin_users")) {
    const rows = await fetchAllRows(client, table.name);

    for (const row of rows) {
      const matches = JSON.stringify(row).match(/\/media-images\/[^"\\\s]+/g) ?? [];
      for (const match of new Set(matches)) {
        references.push(`${table.name}:${String(row.id ?? row.slug ?? "fila")}:${match}`);
      }
    }
  }

  return references;
}
