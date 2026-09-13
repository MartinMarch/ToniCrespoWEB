import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runNewsSqlTests } from "./news-atomic-sql.mjs";

// Genuine PostgreSQL transactions/RLS, with no network socket or external connection string.
// This intentionally does not read .env, linked Supabase credentials, or production data.
const execFile = promisify(execFileCallback);
const repository = fileURLToPath(new URL("../../", import.meta.url));
const { stdout: bindirOutput } = await execFile("pg_config", ["--bindir"]);
const bindir = bindirOutput.trim();
const temporary = await mkdtemp(join(tmpdir(), "tonicrespo-organizer-sql-"));
const databaseDirectory = join(temporary, "data");
const socketDirectory = join(temporary, "socket");
const owner = "organizer_test_owner";
await mkdir(socketDirectory, { mode: 0o700 });
let started = false;
let passed = 0;
const psqlArgs = ["--no-psqlrc", "-h", socketDirectory, "-p", "5432", "-U", owner, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];

async function sql(statement) {
  return new Promise((resolve, reject) => {
    const child = spawn(join(bindir, "psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    let errors = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { errors += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(errors.trim())));
    child.stdin.end(statement);
  });
}

const c = [1, 2, 3, 4].map(number => `10000000-0000-4000-8000-${String(number).padStart(12, "0")}`);
const a = [1, 2, 3, 4, 5].map(number => `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`);
const quoted = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${quoted(JSON.stringify(value))}::jsonb`;
const identity = (email = "admin@example.test", uid = "30000000-0000-4000-8000-000000000001") =>
  `set request.jwt.claims = ${quoted(JSON.stringify({ sub: uid, email }))}; set role authenticated;`;
const expected = (...indexes) => indexes.map(index => ({ id: c[index], artworks: index === 0
  ? [{ id: a[0], sort_order: 10 }, { id: a[1], sort_order: 50 }]
  : index === 1 ? [{ id: a[2], sort_order: 7 }] : index === 3 ? [{ id: a[3], sort_order: 90 }] : [] }));
const next = (...groups) => groups.map(([index, artworks]) => ({ id: c[index], artwork_ids: artworks.map(artwork => a[artwork]) }));
const call = (before, after) => `select public.reorganize_artworks(${json(before)}, ${json(after)});`;
const snapshot = () => sql("select jsonb_build_object('collections', (select jsonb_agg(to_jsonb(c) order by id) from public.collections c), 'artworks', (select jsonb_agg(to_jsonb(a) order by id) from public.artworks a));");
const rows = async () => JSON.parse(await snapshot());

async function seed() {
  // Retain migration-owned permanent collections between cases; exercise their
  // real guards rather than bypassing them with TRUNCATE or disabled triggers.
  await sql(`delete from public.artworks;
    delete from public.collections where not is_recent;
    update public.collections set is_published = true, cover_image_url = null, description_alignment = 'justify' where is_recent;
    insert into public.collections(id, slug, title, cover_image_url, is_published) values
      ('${c[0]}', 'canvas', 'Canvas', 'https://example.test/a.jpg', true),
      ('${c[1]}', 'paper', 'Paper', 'https://example.test/c.jpg', true),
      ('${c[2]}', 'empty', 'Empty hidden collection', null, false),
      ('${c[3]}', 'unrelated', 'Unrelated', 'https://example.test/d.jpg', true);
    insert into public.artworks(id, collection_id, slug, title, description, dimensions, image_url, thumbnail_url, sort_order, is_published, translations) values
      ('${a[0]}', '${c[0]}', 'same', 'A', 'First line\nSecond line', '70 x 90 cm', 'https://example.test/a.jpg', 'https://example.test/a-thumb.jpg', 10, true, '{"en":{"title":"Original A"}}'),
      ('${a[1]}', '${c[0]}', 'hidden', 'Hidden', 'Keep hidden', '50 x 50 cm', 'https://example.test/b.jpg', null, 50, false, '{}'),
      ('${a[2]}', '${c[1]}', 'same', 'C', 'Original C', '20 x 30 cm', 'https://example.test/c.jpg', null, 7, true, '{}'),
      ('${a[3]}', '${c[3]}', 'untouched', 'D', 'Unrelated', null, 'https://example.test/d.jpg', null, 90, true, '{}');`);
}

async function check(name, operation) {
  await seed();
  await operation();
  passed += 1;
  console.log(`✓ ${name}`);
}

async function rejectWithoutChanges(statement, pattern) {
  const before = await snapshot();
  await assert.rejects(sql(statement), pattern);
  assert.equal(await snapshot(), before, "Failed operation must roll back every row and timestamp");
}

try {
  await execFile(join(bindir, "initdb"), ["-D", databaseDirectory, "-U", owner, "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8", "--no-sync"], { maxBuffer: 1024 * 1024 });
  await execFile(join(bindir, "pg_ctl"), ["start", "-D", databaseDirectory, "-l", join(temporary, "postgres.log"), "-o", `-h '' -k ${socketDirectory} -p 5432 -c fsync=off`, "-w", "-t", "30"]);
  started = true;
  await sql(`create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt() ->> 'sub')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key, bucket_id text);
    alter table storage.objects enable row level security;`);
  const migrationsDirectory = join(repository, "supabase/migrations");
  const migrationFiles = (await readdir(migrationsDirectory)).filter(name => name.endsWith(".sql")).sort();
  const alignmentMigrationName = migrationFiles.find(name => name.endsWith("_collection_description_alignment.sql"));
  assert.ok(alignmentMigrationName, "The presentation migration must be present");
  let beforeAlignmentMigration;
  let afterAlignmentMigration;
  for (const name of migrationFiles) {
    if (name === alignmentMigrationName) {
      // An ordinary imported row and the already-seeded permanent collections
      // predate this column. Verify the additive migration against both cases.
      await sql(`insert into public.collections(id, slug, title, description, is_published, source, translations)
        values ('${c[3]}', 'legacy-before-alignment', 'Original legacy title', ${quoted("First paragraph.\n\nSecond paragraph.")}, false,
          'legacy-wordpress', '{"ca":{"title":"Títol original","description":"Text original"}}');`);
      beforeAlignmentMigration = await rows();
    }
    await sql(await readFile(join(migrationsDirectory, name), "utf8"));
    if (name === alignmentMigrationName) afterAlignmentMigration = await rows();
  }
  await sql(`grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    insert into public.admin_users(email) values ('admin@example.test');`);

  if (process.argv.includes("--advisors")) {
    const localConnection = `postgresql://${owner}@localhost/postgres?host=${encodeURIComponent(socketDirectory)}&port=5432`;
    const { stdout } = await execFile(join(repository, "node_modules/.bin/supabase"), [
      "db", "advisors", "--db-url", localConnection, "--type", "security", "--level", "warn", "--output-format", "json",
    ], { cwd: repository, maxBuffer: 4 * 1024 * 1024 });
    // Existing migrations and minimal Auth/Storage fixtures can have their own findings.
    // A new warning referring to our RPC fails this check instead of being silently ignored.
    assert.doesNotMatch(stdout, /reorganize_artworks|delete_empty_collection|protect_catalog_collections|protect_artwork_catalog_branch|save_news_item/, "Security advisor reported an editorial function");
    console.log("✓ Supabase security advisors report no warning for the catalog functions");
  }

  const recentIds = JSON.parse(await sql("select jsonb_object_agg(support_kind, id) from public.collections where is_recent;"));

  await check("description alignment defaults to justify for existing and new collections without changing their data", async () => {
    assert.ok(beforeAlignmentMigration && afterAlignmentMigration);
    assert.equal(beforeAlignmentMigration.collections.some(row => !row.is_recent), true);
    const originalColumns = afterAlignmentMigration.collections.map(row => {
      const { description_alignment, ...previous } = row;
      assert.equal(description_alignment, "justify");
      return previous;
    });
    assert.deepEqual(originalColumns, beforeAlignmentMigration.collections, "No old text, flags, titles, positions or timestamps change");
    assert.deepEqual(afterAlignmentMigration.artworks, beforeAlignmentMigration.artworks);
    assert.ok((await rows()).collections.every(row => row.description_alignment === "justify"));
    const column = JSON.parse(await sql(`select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default)
      from information_schema.columns where table_schema = 'public' and table_name = 'collections' and column_name = 'description_alignment';`));
    assert.deepEqual(column, { type: "text", nullable: "NO", default: "'justify'::text" });
    const beforeRepeat = await snapshot();
    await sql(await readFile(join(migrationsDirectory, alignmentMigrationName), "utf8"));
    assert.equal(await snapshot(), beforeRepeat, "Reapplying the additive migration is safe");
  });

  await check("admins can center ordinary and recent collections in either branch without changing protected metadata or artworks", async () => {
    const ordinaryPaperId = "10000000-0000-4000-8000-000000000005";
    await sql(`insert into public.collections(id, slug, title, support_kind, description)
      values ('${ordinaryPaperId}', 'ordinary-paper', 'Ordinary paper', 'paper', 'Original description');`);
    const before = await rows();
    const targets = [c[0], ordinaryPaperId, recentIds.canvas, recentIds.paper];
    await sql(`${identity()} update public.collections set description_alignment = 'center' where id in (${targets.map(quoted).join(",")});`);
    const after = await rows();
    for (const row of after.collections) {
      const previous = before.collections.find(item => item.id === row.id);
      assert.deepEqual(row, { ...previous, description_alignment: targets.includes(row.id) ? "center" : previous.description_alignment });
    }
    assert.deepEqual(after.artworks, before.artworks);
    await sql(`${identity()} update public.collections set description = ${quoted("Updated paragraph.\n\nAnother paragraph.")} where id = '${recentIds.paper}';`);
    assert.equal((await rows()).collections.find(row => row.id === recentIds.paper).description_alignment, "center", "Omitted alignment stays centered");
    await sql(`${identity()} update public.collections set description_alignment = 'justify' where id in (${targets.map(quoted).join(",")});`);
    assert.ok((await rows()).collections.every(row => row.description_alignment === "justify"));
  });

  await check("description alignment rejects null and unsupported values atomically for ordinary and permanent collections", async () => {
    for (const id of [c[0], recentIds.canvas, recentIds.paper]) {
      await rejectWithoutChanges(`${identity()} update public.collections set description_alignment = null, description = 'Do not retain' where id = '${id}';`, /null value.*description_alignment.*not-null constraint/);
      for (const invalid of ["", "left", "CENTER", " center ", "center; color:red"]) {
        await rejectWithoutChanges(`${identity()} update public.collections set description_alignment = ${quoted(invalid)}, description = 'Do not retain' where id = '${id}';`, /collections_description_alignment_check/);
      }
    }
    await rejectWithoutChanges(`${identity()} insert into public.collections(slug, title, description_alignment)
      values ('bad-alignment', 'Not inserted', 'right');`, /collections_description_alignment_check/);
  });

  await check("description alignment obeys existing admin-only write policies and published-only public reads", async () => {
    await sql(`${identity()} update public.collections set description_alignment = 'center' where id in ('${c[0]}', '${c[2]}', '${recentIds.canvas}');`);
    const before = await snapshot();
    await sql("set role anon; update public.collections set description_alignment = 'justify';");
    await sql(`${identity("visitor@example.test")} update public.collections set description_alignment = 'justify';`);
    assert.equal(await snapshot(), before, "Anonymous and authenticated non-admin updates affect no rows");
    for (const role of ["set role anon;", identity("visitor@example.test")]) {
      await rejectWithoutChanges(`${role} insert into public.collections(slug, title, description_alignment)
        values ('unauthorized-centered', 'Not inserted', 'center');`, /row-level security/);
    }
    assert.equal(await sql(`set role anon; select description_alignment from public.collections where id = '${c[0]}';`), "SET\ncenter");
    assert.equal(await sql(`${identity("visitor@example.test")} select description_alignment from public.collections where id = '${recentIds.canvas}';`), "SET\nSET\ncenter");
    assert.equal(await sql(`set role anon; select count(*) from public.collections where id = '${c[2]}';`), "SET\n0");
    assert.equal(await sql(`${identity()} select description_alignment from public.collections where id = '${c[2]}';`), "SET\nSET\ncenter");
  });

  await check("exactly one empty permanent recent collection is seeded per branch with localized titles", async () => {
    const recent = (await rows()).collections.filter(row => row.is_recent);
    assert.equal(recent.length, 2);
    assert.deepEqual(recent.map(row => row.support_kind).sort(), ["canvas", "paper"]);
    for (const row of recent) {
      assert.equal(row.title, "Obras recientes");
      assert.equal(row.source, "supabase");
      assert.equal(row.is_published, true);
      assert.equal(row.sort_order, -1);
      assert.equal(row.slug, row.support_kind === "canvas" ? "obras-recientes-lienzos" : "obras-recientes-papel");
      assert.deepEqual(row.translations, { ca: { title: "Obres recents" }, en: { title: "Recent works" }, de: { title: "Neue Werke" } });
    }
    assert.equal((await rows()).artworks.filter(row => [recentIds.canvas, recentIds.paper].includes(row.collection_id)).length, 0);
  });

  await check("recent collections cannot be deleted, renamed, demoted, duplicated or reassigned", async () => {
    const target = `where id = '${recentIds.canvas}'`;
    for (const statement of [
      `delete from public.collections ${target}`,
      `update public.collections set is_recent = false ${target}`,
      `update public.collections set title = 'Renamed' ${target}`,
      `update public.collections set slug = 'renamed' ${target}`,
      `update public.collections set source = 'legacy-wordpress' ${target}`,
      `update public.collections set translations = '{}'::jsonb ${target}`,
      `update public.collections set id = '${a[4]}' ${target}`,
      `update public.collections set is_recent = true where id = '${c[2]}'`,
    ]) await rejectWithoutChanges(`${identity()} ${statement};`, /RECENT_COLLECTION_PROTECTED/);
    await rejectWithoutChanges(`${identity()} insert into public.collections(slug, title, is_recent, support_kind) values ('extra-recent', 'Extra', true, 'canvas');`, /duplicate key/);
    await rejectWithoutChanges(`${identity()} update public.collections set support_kind = 'paper' ${target};`, /COLLECTION_BRANCH_IMMUTABLE/);
  });

  await check("recent collections can hide/show and change descriptions, but remain in their fixed slot", async () => {
    await sql(`${identity()} update public.collections set is_published = false, sort_order = 999, description = 'Editable description' where id = '${recentIds.canvas}';`);
    let recent = (await rows()).collections.find(row => row.id === recentIds.canvas);
    assert.equal(recent.is_published, false);
    assert.equal(recent.sort_order, -1);
    assert.equal(recent.description, "Editable description");
    assert.equal(await sql(`set role anon; select count(*) from public.collections where id = '${recentIds.canvas}';`), "SET\n0");
    await sql(`${identity()} update public.collections set is_published = true where id = '${recentIds.canvas}';`);
    recent = (await rows()).collections.find(row => row.id === recentIds.canvas);
    assert.equal(recent.is_published, true);
    assert.equal(recent.id, recentIds.canvas);
  });

  await check("all collection branches are immutable even for an empty non-recent collection", async () => {
    for (const id of [c[0], c[2]]) {
      await rejectWithoutChanges(`${identity()} update public.collections set support_kind = 'paper' where id = '${id}';`, /COLLECTION_BRANCH_IMMUTABLE/);
    }
  });

  await check("direct and RPC artwork moves between branches fail atomically", async () => {
    await rejectWithoutChanges(`${identity()} update public.artworks set collection_id = '${recentIds.paper}' where id = '${a[0]}';`, /ARTWORK_BRANCH_MISMATCH/);
    await rejectWithoutChanges(`${identity()} ${call([...expected(0), { id: recentIds.paper, artworks: [] }], [
      ...next([0, [1]]), { id: recentIds.paper, artwork_ids: [a[0]] },
    ])}`, /ARTWORK_BRANCH_MISMATCH/);
  });

  await check("one RPC can organize both branches without crossing them and retain availability", async () => {
    await sql(`insert into public.artworks(id, collection_id, slug, title, image_url, sort_order, is_available)
      values ('${a[4]}', '${recentIds.paper}', 'paper-only', 'Paper only', 'paper.jpg', 80, false);
      update public.artworks set is_available = false where id = '${a[0]}';`);
    await sql(`${identity()} ${call([...expected(0), { id: recentIds.canvas, artworks: [] },
      { id: recentIds.paper, artworks: [{ id: a[4], sort_order: 80 }] }], [
      ...next([0, [1]]), { id: recentIds.canvas, artwork_ids: [a[0]] }, { id: recentIds.paper, artwork_ids: [a[4]] },
    ])}`);
    const current = await rows();
    assert.equal(current.artworks.find(row => row.id === a[0]).collection_id, recentIds.canvas);
    assert.equal(current.artworks.find(row => row.id === a[0]).is_available, false);
    assert.equal(current.artworks.find(row => row.id === a[4]).collection_id, recentIds.paper);
    assert.equal(current.artworks.find(row => row.id === a[4]).sort_order, 0);
    assert.equal(current.artworks.find(row => row.id === a[4]).is_available, false);
    assert.ok(current.collections.filter(row => row.is_recent).every(row => row.sort_order === -1));
  });

  await check("availability defaults true, stays publicly visible when false, and obeys existing RLS", async () => {
    assert.ok((await rows()).artworks.every(row => row.is_available === true));
    await sql(`${identity()} update public.artworks set is_available = false where id = '${a[0]}';`);
    const work = (await rows()).artworks.find(row => row.id === a[0]);
    assert.equal(work.is_available, false);
    assert.equal(work.is_published, true);
    assert.equal(await sql(`set role anon; select is_available from public.artworks where id = '${a[0]}';`), "SET\nf");
    const before = await snapshot();
    await sql(`${identity("visitor@example.test")} update public.artworks set is_available = true where id = '${a[0]}';`);
    await sql("set role anon; update public.collections set is_published = false where is_recent;");
    assert.equal(await snapshot(), before);
  });

  await check("hiding a collection protects direct artwork reads for visitors and non-admins, without changing artwork flags", async () => {
    await sql(`${identity()} update public.collections set is_published = false where id = '${c[0]}';`);
    assert.equal((await rows()).artworks.find(row => row.id === a[0]).is_published, true);
    assert.equal(await sql(`set role anon; select count(*) from public.artworks where id = '${a[0]}';`), "SET\n0");
    assert.equal(await sql(`${identity("visitor@example.test")} select count(*) from public.artworks where id = '${a[0]}';`), "SET\nSET\n0");
    assert.equal(await sql(`${identity()} select count(*) from public.artworks where id = '${a[0]}';`), "SET\nSET\n1");
    await sql(`${identity()} update public.collections set is_published = true where id = '${c[0]}';`);
    assert.equal(await sql(`set role anon; select count(*) from public.artworks where id = '${a[0]}';`), "SET\n1");
    assert.equal(await sql(`${identity("visitor@example.test")} select count(*) from public.artworks where id = '${a[0]}';`), "SET\nSET\n1");
    assert.equal(await sql(`set role anon; select count(*) from public.artworks where id = '${a[1]}';`), "SET\n0", "Showing the parent must not publish a hidden child");
  });

  await check("safe empty deletion requires admin and rejects recent/nonempty/missing collections", async () => {
    const operation = `select public.delete_empty_collection('${c[2]}');`;
    await rejectWithoutChanges(`set role anon; ${operation}`, /permission denied/);
    await rejectWithoutChanges(`${identity("visitor@example.test")} ${operation}`, /Only administrators/);
    await rejectWithoutChanges(`${identity()} select public.delete_empty_collection('${recentIds.canvas}');`, /RECENT_COLLECTION_PROTECTED/);
    await rejectWithoutChanges(`${identity()} select public.delete_empty_collection('${c[0]}');`, /COLLECTION_NOT_EMPTY/);
    await rejectWithoutChanges(`${identity()} select public.delete_empty_collection('${a[4]}');`, /COLLECTION_NOT_FOUND/);
    await sql(`${identity()} ${operation}`);
    assert.ok(!(await rows()).collections.some(row => row.id === c[2]));
    assert.equal((await rows()).artworks.length, 4);
  });

  await check("concurrent artwork insertion and empty deletion cannot erase a committed artwork", async () => {
    const insert = `${identity()} insert into public.artworks(id, collection_id, slug, title, image_url)
      values ('${a[4]}', '${c[2]}', 'racing', 'Racing artwork', 'race.jpg');`;
    const remove = `${identity()} select public.delete_empty_collection('${c[2]}');`;
    const [insertResult, deleteResult] = await Promise.allSettled([sql(insert), sql(remove)]);
    const current = await rows();
    if (insertResult.status === "fulfilled") {
      assert.equal(deleteResult.status, "rejected");
      assert.match(deleteResult.reason.message, /COLLECTION_NOT_EMPTY/);
      assert.ok(current.artworks.some(row => row.id === a[4]));
      assert.ok(current.collections.some(row => row.id === c[2]));
    } else {
      assert.equal(deleteResult.status, "fulfilled");
      assert.match(insertResult.reason.message, /foreign key constraint/);
      assert.ok(!current.collections.some(row => row.id === c[2]));
    }
  });

  await check("function is invoker, safe search_path, authenticated-only, with collection/artwork RLS", async () => {
    const value = JSON.parse(await sql(`select jsonb_build_object(
      'definer', p.prosecdef, 'settings', p.proconfig,
      'anon', has_function_privilege('anon', p.oid, 'execute'),
      'authenticated', has_function_privilege('authenticated', p.oid, 'execute'),
      'rls', (select bool_and(relrowsecurity) from pg_class where oid in ('public.artworks'::regclass, 'public.collections'::regclass)))
      from pg_proc p where p.oid = 'public.reorganize_artworks(jsonb,jsonb)'::regprocedure;`));
    assert.equal(value.definer, false);
    assert.ok(value.settings.includes('search_path=""'));
    assert.equal(value.anon, false);
    assert.equal(value.authenticated, true);
    assert.equal(value.rls, true);
  });

  await check("anonymous calls and authenticated non-admins are denied without changes", async () => {
    const operation = call(expected(0), next([0, [1, 0]]));
    await rejectWithoutChanges(`set role anon; ${operation}`, /permission denied/i);
    await rejectWithoutChanges(`${identity("visitor@example.test")} ${operation}`, /Only administrators/i);
    await rejectWithoutChanges(`${identity("admin@example.test", null)} ${operation}`, /Only administrators/i);
  });

  await check("reorder uses zero-based positions, retains hidden status and chooses first published cover", async () => {
    const original = await rows();
    await sql(`${identity()} ${call(expected(0), next([0, [1, 0]]))}`);
    const current = await rows();
    assert.equal(current.artworks.find(row => row.id === a[1]).sort_order, 0);
    assert.equal(current.artworks.find(row => row.id === a[0]).sort_order, 1);
    assert.equal(current.artworks.find(row => row.id === a[1]).is_published, false);
    assert.equal(current.collections.find(row => row.id === c[0]).cover_image_url, "https://example.test/a.jpg");
    assert.deepEqual(current.artworks.find(row => row.id === a[3]), original.artworks.find(row => row.id === a[3]));
    assert.deepEqual(current.collections.find(row => row.id === c[3]), original.collections.find(row => row.id === c[3]));
  });

  await check("move to empty hidden collection, empty source and preserve every editorial/media field", async () => {
    const original = await rows();
    await sql(`${identity()} ${call(expected(0, 2), next([0, []], [2, [1, 0]]))}`);
    const current = await rows();
    assert.equal(current.collections.find(row => row.id === c[0]).cover_image_url, null);
    assert.equal(current.collections.find(row => row.id === c[2]).cover_image_url, "https://example.test/a.jpg");
    assert.equal(current.collections.find(row => row.id === c[2]).is_published, false);
    assert.equal(current.artworks.length, original.artworks.length);
    for (const id of [a[0], a[1]]) {
      const before = original.artworks.find(row => row.id === id);
      const after = current.artworks.find(row => row.id === id);
      assert.equal(after.collection_id, c[2]);
      const omitOrganization = ({ collection_id, sort_order, updated_at, ...metadata }) => metadata;
      assert.deepEqual(omitOrganization(after), omitOrganization(before));
    }
  });

  await check("slug collision only renames the incoming work; existing work and ordering remain intact", async () => {
    await sql(`${identity()} ${call(expected(0, 1), next([0, [1]], [1, [0, 2]]))}`);
    const current = await rows();
    const moved = current.artworks.find(row => row.id === a[0]);
    assert.equal(moved.slug, `same-${a[0]}`);
    assert.equal(moved.collection_id, c[1]);
    assert.equal(current.artworks.find(row => row.id === a[2]).slug, "same");
    assert.equal(current.collections.find(row => row.id === c[0]).cover_image_url, null, "hidden-only collection must not leak its image");
    assert.equal(current.collections.find(row => row.id === c[1]).cover_image_url, "https://example.test/a.jpg");
  });

  await check("swapping identical slugs across collections succeeds without unnecessary renaming", async () => {
    await sql(`${identity()} ${call(expected(0, 1), next([0, [2, 1]], [1, [0]]))}`);
    const current = await rows();
    assert.equal(current.artworks.find(row => row.id === a[0]).slug, "same");
    assert.equal(current.artworks.find(row => row.id === a[2]).slug, "same");
    assert.equal(current.artworks.find(row => row.id === a[2]).collection_id, c[0]);
  });

  await check("pre-existing generated slug candidates are preserved and get a unique fallback", async () => {
    await sql(`insert into public.artworks(id, collection_id, slug, title, image_url) values
      ('${a[4]}', '${c[1]}', 'same-${a[0]}', 'Existing suffix', 'existing.jpg');`);
    const before = expected(0, 1);
    before[1].artworks.push({ id: a[4], sort_order: 0 });
    await sql(`${identity()} ${call(before, next([0, [1]], [1, [0, 2, 4]]))}`);
    const current = await rows();
    assert.equal(current.artworks.find(row => row.id === a[0]).slug, `same-${a[0]}-2`);
    assert.equal(current.artworks.find(row => row.id === a[4]).slug, `same-${a[0]}`);
  });

  await check("stale sort orders, extra/removed works and deleted collections reject atomically", async () => {
    const operation = call(expected(0, 1), next([0, [1]], [1, [0, 2]]));
    await sql(`update public.artworks set sort_order = 999 where id = '${a[0]}';`);
    await rejectWithoutChanges(`${identity()} ${operation}`, /ORGANIZATION_CONFLICT/);
    await seed();
    await sql(`insert into public.artworks(id, collection_id, slug, title, image_url) values ('${a[4]}', '${c[0]}', 'new', 'New', 'new.jpg');`);
    await rejectWithoutChanges(`${identity()} ${operation}`, /ORGANIZATION_CONFLICT/);
    await seed();
    await sql(`delete from public.artworks where id = '${a[0]}';`);
    await rejectWithoutChanges(`${identity()} ${operation}`, /ORGANIZATION_CONFLICT/);
    await seed();
    await sql(`delete from public.collections where id = '${c[1]}';`);
    await rejectWithoutChanges(`${identity()} ${operation}`, /ORGANIZATION_CONFLICT/);
    await seed();
    await sql(`update public.artworks set collection_id = '${c[3]}' where id = '${a[0]}';`);
    await rejectWithoutChanges(`${identity()} ${operation}`, /ORGANIZATION_CONFLICT/);
  });

  await check("duplicate, missing, foreign and malformed membership cannot delete or duplicate works", async () => {
    const malformed = [
      [expected(0), next([0, [0, 0]])],
      [expected(0), next([0, [0]])],
      [expected(0), next([0, [0, 3]])],
      [expected(0), next([0, [0, 1]], [0, []])],
      [[{ id: c[0], artworks: null }], next([0, [0, 1]])],
      [expected(0), [{ id: c[0], artwork_ids: null }]],
      [expected(0), [{ id: c[0], artwork_ids: [null] }]],
      [[{ id: c[0], artworks: [{ id: a[0], sort_order: 10.5 }] }], next([0, [0]])],
    ];
    for (const [before, after] of malformed) await rejectWithoutChanges(`${identity()} ${call(before, after)}`, /ERROR:/);
  });

  await check("metadata edited after the snapshot is preserved and does not block organization", async () => {
    await sql(`update public.artworks set description = 'Updated elsewhere', translations = '{"en":{"title":"Changed elsewhere"}}' where id = '${a[0]}';`);
    await sql(`${identity()} ${call(expected(0), next([0, [1, 0]]))}`);
    const artwork = (await rows()).artworks.find(row => row.id === a[0]);
    assert.equal(artwork.description, "Updated elsewhere");
    assert.deepEqual(artwork.translations, { en: { title: "Changed elsewhere" } });
  });

  await check("failure after move/rename statements rolls back every work, cover and timestamp", async () => {
    await sql(`create function public.organizer_test_fail_cover() returns trigger language plpgsql as $$ begin raise exception 'simulated cover failure'; end; $$;
      create trigger organizer_test_fail_cover before update on public.collections for each row execute function public.organizer_test_fail_cover();`);
    try {
      await rejectWithoutChanges(`${identity()} ${call(expected(0, 1), next([0, [1]], [1, [0, 2]]))}`, /simulated cover failure/);
    } finally {
      await sql("drop trigger organizer_test_fail_cover on public.collections; drop function public.organizer_test_fail_cover();");
    }
  });

  await check("two concurrent requests from the same snapshot yield one success and one stale conflict", async () => {
    const operation = `${identity()} ${call(expected(0, 1), next([0, [1]], [1, [0, 2]]))}`;
    const results = await Promise.allSettled([sql(operation), sql(operation)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const failure = results.find(result => result.status === "rejected");
    assert.match(failure.reason.message, /ORGANIZATION_CONFLICT/);
    const current = await rows();
    assert.equal(current.artworks.length, 4);
    assert.equal(current.artworks.find(row => row.id === a[0]).collection_id, c[1]);
  });

  await check("empty no-op saves are safe and public readers still cannot see hidden works", async () => {
    const original = await snapshot();
    await sql(`${identity()} ${call([], [])}`);
    assert.equal(await snapshot(), original);
    assert.equal(await sql(`set role anon; select count(*) from public.artworks where id = '${a[1]}';`), "SET\n0");
  });

  const newsMigrationName = migrationFiles.find(name => name.endsWith("_news_item_atomic_save.sql"));
  assert.ok(newsMigrationName, "The atomic news migration must be present");
  passed += await runNewsSqlTests({ sql, identity, quoted, json,
    migrationSql: await readFile(join(migrationsDirectory, newsMigrationName), "utf8"),
    liveRollbackSql: await readFile(new URL("./news-live-rollback.sql", import.meta.url), "utf8"),
  });
  console.log(`Editorial PostgreSQL: ${passed}/${passed} tests passed. No remote database accessed.`);
} finally {
  if (started) await execFile(join(bindir, "pg_ctl"), ["stop", "-D", databaseDirectory, "-m", "fast", "-w", "-t", "30"]);
  // Only this process's mkdtemp directory; no user databases or Docker volumes are touched.
  if (basename(temporary).startsWith("tonicrespo-organizer-sql-") && temporary.startsWith(tmpdir())) {
    await rm(temporary, { recursive: true, force: true });
  }
}
