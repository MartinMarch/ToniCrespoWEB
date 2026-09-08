import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";

const rootDir = fileURLToPath(new URL("../../", import.meta.url));
const args = new Set(process.argv.slice(2));
const env = {
  ...readEnvFile(path.join(rootDir, ".env")),
  ...readEnvFile(path.join(rootDir, ".env.test")),
  ...process.env,
};

if (!args.has("--run") && env.SUPABASE_TEST_RUN !== "true") {
  throw new Error(
    "Esta prueba crea datos temporales en Supabase. Ejecuta npm run test:supabase -- --run para confirmarlo.",
  );
}

const config = {
  url: firstValue(env.SUPABASE_TEST_URL),
  anonKey: firstValue(env.SUPABASE_TEST_ANON_KEY),
  serviceRoleKey: firstValue(env.SUPABASE_TEST_SERVICE_ROLE_KEY, env.SUPABASE_TEST_SECRET_KEY),
};

if (!config.url || !config.anonKey || !config.serviceRoleKey) {
  throw new Error(
    "Faltan claves de prueba. Define SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY. No se reutilizan automáticamente las claves de producción.",
  );
}

const targetUrl = new URL(config.url);
const productionHosts = new Set([
  "aqleunaqzixdatttvqby.supabase.co",
  ...(env.VITE_SUPABASE_URL ? [new URL(env.VITE_SUPABASE_URL).host] : []),
]);
const isProduction = productionHosts.has(targetUrl.host);
if (isProduction && !args.has("--allow-production")) {
  throw new Error("El destino coincide con producción. Usa un proyecto de pruebas separado o confirma explícitamente con --allow-production.");
}
// Never publish fixtures on the live site. A separate test project exercises
// publication transitions; production only checks existing public rows read-only.
const publishFixtures = !isProduction;

const clientOptions = {
  global: {
    fetch: (input, init = {}) => fetch(input, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
    }),
  },
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
  realtime: {
    transport: resolveWebSocketTransport(),
  },
};
const serviceClient = createClient(config.url, config.serviceRoleKey, clientOptions);
const publicClient = createClient(config.url, config.anonKey, clientOptions);
const adminClient = createClient(config.url, config.anonKey, clientOptions);
const memberClient = createClient(config.url, config.anonKey, clientOptions);
const runId = randomUUID();
const marker = `e2e-tonicrespo-${runId}`;
const state = {
  assets: [],
  email: `${marker}@tests.invalid`,
  userId: null,
  memberEmail: `${marker}-member@tests.invalid`,
  memberUserId: null,
  sessions: [],
  settingsKey: `${marker}-settings`,
};
const passedChecks = [];
const testImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7NwAAAABJRU5ErkJggg==",
  "base64",
);

console.log(`Supabase integration target: ${new URL(config.url).host}`);
console.log(`Test run: ${marker}`);
console.log(isProduction
  ? "Production safeguards: all editorial fixtures remain hidden; published-content checks are read-only."
  : "Isolated target: publication transitions and public fixture reads enabled.");

let suiteError = null;

try {
  await runSuite();
} catch (error) {
  suiteError = asError(error);
  console.error(`Integration failure: ${suiteError.message}`);
}

const cleanupErrors = await cleanupTestData();

if (suiteError) {
  if (cleanupErrors.length > 0) {
    suiteError.message = `${suiteError.message}\nCleanup errors:\n${cleanupErrors.join("\n")}`;
  }
  throw suiteError;
}

if (cleanupErrors.length > 0) {
  throw new Error(`The test data could not be fully removed:\n${cleanupErrors.join("\n")}`);
}

console.log(`Supabase integration passed: ${passedChecks.length} checks. Temporary user, rows and assets removed.`);

async function runSuite() {
  await check("required Supabase schema", assertRequiredSchema);
  await check("temporary admin authentication and is_admin", provisionTemporaryAdmin);
  await check("authenticated non-admin authorization and metadata cannot grant admin", provisionTemporaryMember);
  await check("anonymous is_admin and public read endpoints", assertPublicReadEndpoints);
  await check("RLS rejects unauthenticated writes", assertAnonymousWriteIsRejected);
  await check("RLS rejects non-admin inserts, updates and deletes", assertNonAdminWritesAreRejected);
  await check("site settings isolated CRUD and non-admin RLS", testSiteSettings);
  await check("site-assets upload, replacement, anonymous denial and cleanup", testSiteAssets);
  await check("Trayectoria content, translations and biography storage", testBiographyFlow);
  await check("Lienzos and Laminas collections, artwork cover refresh, collection cascade and storage", testCollectionsAndArtworks);
  await check("Fotografia insert, public read, delete and storage cleanup", testPhotographyFlow);
  await check("Noticias insert, public read, child images, delete and storage cleanup", testNewsFlow);
}

async function assertRequiredSchema() {
  const fields = {
    site_pages: "id,kind,html,content,is_published,translations",
    collections: "id,support_kind,cover_image_url,is_published,translations",
    artworks: "id,description,is_published,translations",
    photography_items: "id,is_published,translations",
    news_items: "id,published_at,is_published,translations",
    news_item_images: "id,news_item_id,translations",
    site_settings: "key,value",
    admin_users: "email",
  };
  for (const [table, columns] of Object.entries(fields)) {
    requireData(await serviceClient.from(table).select(columns).limit(0), `checking ${table} schema`);
  }
}

async function provisionTemporaryAdmin() {
  const password = `Test-${randomBytes(18).toString("base64url")}Aa1!`;
  const userData = requireData(
    await serviceClient.auth.admin.createUser({
      email: state.email,
      email_confirm: true,
      password,
    }),
    "creating temporary Auth user",
  );

  state.userId = userData.user?.id ?? null;
  expect(state.userId, "Supabase did not return an id for the temporary Auth user.");

  requireData(
    await serviceClient.from("admin_users").insert({ email: state.email }),
    "granting temporary admin access",
  );

  const sessionData = requireData(
    await adminClient.auth.signInWithPassword({ email: state.email, password }),
    "signing in temporary admin",
  );
  expect(sessionData.session, "Temporary admin did not receive a session.");
  state.sessions.push({ client: adminClient, token: sessionData.session.access_token, label: "admin" });

  const isAdmin = requireData(await adminClient.rpc("is_admin"), "checking is_admin");
  expect(isAdmin === true, "Temporary user is authenticated but does not have admin access.");
}

async function assertAnonymousWriteIsRejected() {
  const { error } = await publicClient.from("collections").insert({
    description: "This row must be rejected by RLS.",
    is_published: false,
    slug: `${marker}-anonymous-denied`,
    sort_order: 1,
    source: "supabase",
    support_kind: "canvas",
    title: `${marker} anonymous denied`,
    translations: {},
  });

  expect(error?.code === "42501", "Anonymous collection insert was not rejected by an RLS/privilege error.");
}

async function provisionTemporaryMember() {
  const password = `Test-${randomBytes(24).toString("base64url")}Aa1!`;
  const created = requireData(await serviceClient.auth.admin.createUser({
    email: state.memberEmail, email_confirm: true, password,
    user_metadata: { is_admin: true, role: "admin", email: state.email },
  }), "creating temporary non-admin Auth user");
  state.memberUserId = created.user?.id ?? null;
  expect(state.memberUserId, "Temporary non-admin user has no id.");
  const signedIn = requireData(await memberClient.auth.signInWithPassword({ email: state.memberEmail, password }), "signing in temporary non-admin");
  expect(signedIn.session, "Temporary non-admin did not receive a session.");
  state.sessions.push({ client: memberClient, token: signedIn.session.access_token, label: "non-admin" });
  expect(requireData(await memberClient.rpc("is_admin"), "checking non-admin is_admin") === false,
    "User-editable metadata granted administrator access.");
}

async function assertPublicReadEndpoints() {
  expect(requireData(await publicClient.rpc("is_admin"), "checking anonymous is_admin") === false,
    "Anonymous requests must not have admin privileges.");
  for (const table of ["site_pages", "collections", "artworks", "photography_items", "news_items"]) {
    const rows = requireData(await publicClient.from(table).select("id,is_published").limit(5), `checking public ${table} reads`);
    expect(rows.every((row) => row.is_published === true), `Public ${table} query leaked hidden rows.`);
  }
  requireData(await publicClient.from("news_item_images").select("id").limit(1), "checking public news image endpoint");
  const settings = requireData(await publicClient.from("site_settings").select("key,value").eq("key", "global").single(), "checking public global settings");
  expect(["es", "en", "de", "ca"].includes(settings.value?.defaultLanguage), "Global default language is invalid.");
  expect(settings.value?.contact && typeof settings.value.contact === "object", "Global contact settings are absent.");
  for (const [label, client] of [["anonymous", publicClient], ["non-admin", memberClient]]) {
    const admins = requireData(await client.from("admin_users").select("email").limit(1), `checking ${label} admin list isolation`);
    expect(admins.length === 0, `${label} can read the administrator list.`);
  }
}

async function assertNonAdminWritesAreRejected() {
  const response = await memberClient.from("collections").insert({
    slug: `${marker}-member-denied`, title: `${marker} denied`, support_kind: "canvas",
    description: "Must not be saved", is_published: false, source: "supabase", translations: {},
  });
  expect(response.error?.code === "42501", "Non-admin collection insert was not rejected by RLS.");
  const grant = await memberClient.from("admin_users").insert({ email: state.memberEmail });
  expect(grant.error?.code === "42501", "A non-admin could grant themselves administrator access.");
  const collection = await createCollection("canvas", "rls-isolation");
  await assertForeignWritesDenied("collections", collection.id, "title");
  requireData(await adminClient.from("collections").delete().eq("id", collection.id).select("id").single(), "removing RLS test collection");
}

async function assertForeignWritesDenied(table, id, column, keyColumn = "id") {
  const before = requireData(await serviceClient.from(table).select(column).eq(keyColumn, id).single(), `reading ${table} fixture before denied writes`);
  for (const [label, client] of [["anonymous", publicClient], ["non-admin", memberClient]]) {
    const updated = await client.from(table).update({ [column]: column === "value" ? { test: marker, forbidden: true } : `${marker} forbidden` }).eq(keyColumn, id).select(keyColumn);
    expect(updated.error?.code === "42501" || (!updated.error && updated.data?.length === 0), `${label} updated ${table}.`);
    const deleted = await client.from(table).delete().eq(keyColumn, id).select(keyColumn);
    expect(deleted.error?.code === "42501" || (!deleted.error && deleted.data?.length === 0), `${label} deleted ${table}.`);
    const after = requireData(await serviceClient.from(table).select(column).eq(keyColumn, id).single(), `checking ${table} fixture survived denied writes`);
    expect(JSON.stringify(after[column]) === JSON.stringify(before[column]), `${label} silently modified ${table}.`);
  }
  const fixture = requireData(await serviceClient.from(table).select("*").eq(keyColumn, id).single(), `reading ${table} fixture for insert isolation`);
  for (const [label, client] of [["anonymous", publicClient], ["non-admin", memberClient]]) {
    const copy = { ...fixture };
    delete copy.created_at;
    delete copy.updated_at;
    if (keyColumn === "id") copy.id = randomUUID();
    if ("slug" in copy) copy.slug = `${marker}-${table}-${label}-denied`;
    if ("kind" in copy) copy.kind = `${marker}-${table}-${label}-denied`;
    if ("is_published" in copy) copy.is_published = false;
    if (keyColumn === "key") copy.key = `${marker}-settings-${label}-denied`;
    const inserted = await client.from(table).insert(copy);
    expect(inserted.error?.code === "42501", `${label} insert into ${table} was not rejected by RLS.`);
  }
}

async function testSiteSettings() {
  const value = { testRun: marker, defaultLanguage: "ca", contact: { email: `${marker}@tests.invalid` } };
  requireData(await adminClient.from("site_settings").insert({ key: state.settingsKey, value }).select("key").single(), "creating isolated settings key");
  const settings = requireData(await publicClient.from("site_settings").select("value").eq("key", state.settingsKey).single(), "reading isolated settings publicly");
  expect(settings.value.testRun === marker, "Isolated settings were not saved.");
  const updated = requireData(await adminClient.from("site_settings").update({ value: { ...value, defaultLanguage: "en" } }).eq("key", state.settingsKey).select("value").single(), "updating isolated default language");
  expect(updated.value.defaultLanguage === "en", "Isolated default language update failed.");
  await assertForeignWritesDenied("site_settings", state.settingsKey, "value", "key");
  requireData(await adminClient.from("site_settings").delete().eq("key", state.settingsKey).select("key").single(), "removing isolated settings");
}

async function testSiteAssets() {
  const asset = await uploadAsset("site-assets", "shared-asset");
  requireData(await adminClient.storage.from(asset.bucket).upload(asset.path, testImage, {
    contentType: "image/png", cacheControl: "0", upsert: true,
  }), "replacing an existing site asset as admin");
  for (const [label, client] of [["anonymous", publicClient], ["non-admin", memberClient]]) {
    const forbidden = { bucket: "site-assets", path: `e2e/${runId}/${label}-forbidden.png` };
    state.assets.push(forbidden);
    const upload = await client.storage.from(forbidden.bucket).upload(forbidden.path, testImage, { contentType: "image/png" });
    expect(upload.error && /row.level security|unauthori[sz]ed|permission|not allowed/i.test(upload.error.message), `${label} upload was not rejected by Storage RLS.`);
    const replacement = await client.storage.from(asset.bucket).upload(asset.path, testImage, { contentType: "image/png", upsert: true });
    expect(replacement.error && /row.level security|unauthori[sz]ed|permission|not allowed/i.test(replacement.error.message), `${label} could replace an existing asset.`);
  }
  await removeAsset(asset);
}

async function readFixture(table, id, columns) {
  if (!publishFixtures) {
    const hidden = requireData(await publicClient.from(table).select("id").eq("id", id), `checking hidden production ${table} fixture`);
    expect(hidden.length === 0, `A production ${table} fixture became publicly visible.`);
  }
  const client = publishFixtures ? publicClient : adminClient;
  return requireData(await client.from(table).select(columns).eq("id", id).single(), `reading ${table} fixture as ${publishFixtures ? "public" : "admin"}`);
}

async function testBiographyFlow() {
  const asset = await uploadAsset("biography", "trayectoria");
  const slug = `${marker}-page`;
  const kind = `${marker}-page`;
  const firstHtml = `<p>${marker} trayectoria inicial</p>`;
  const updatedHtml = `<p>${marker} trayectoria actualizada</p>`;
  const translations = pageTranslations(marker);

  const page = requireData(
    await adminClient
      .from("site_pages")
      .upsert(
        {
          content: {
            galleryImages: [{ alt: `${marker} galeria`, url: asset.publicUrl }],
            mainImageAlt: `${marker} portada`,
            mainImageUrl: asset.publicUrl,
          },
          html: firstHtml,
          is_published: publishFixtures,
          kind,
          slug,
          title: `${marker} Trayectoria`,
          translations,
        },
        { onConflict: "kind" },
      )
      .select("id, content, html, translations")
      .single(),
    "creating trayectoria test page",
  );

  const publicPage = await readFixture("site_pages", page.id, "content, html, translations");
  expect(publicPage.html === firstHtml, "Public client did not receive the saved trayectoria HTML.");
  expect(publicPage.content?.mainImageUrl === asset.publicUrl, "Trayectoria image URL was not persisted.");
  expect(publicPage.translations?.en?.title === translations.en.title, "Partial trayectoria translations were not persisted.");
  expect(!publicPage.translations?.de, "An empty trayectoria translation should not be created.");

  const delayedPageTranslations = {
    ...translations,
    ca: { html: `<p>${marker} catala afegit després</p>`, title: `${marker} Catala afegit després` },
  };
  const delayedPage = requireData(
    await adminClient
      .from("site_pages")
      .update({ translations: delayedPageTranslations })
      .eq("id", page.id)
      .select("translations")
      .single(),
    "adding a trayectoria translation after creation",
  );
  expect(delayedPage.translations?.ca?.title === delayedPageTranslations.ca.title, "A delayed trayectoria translation was not saved.");

  const updatedPage = requireData(
    await adminClient
      .from("site_pages")
      .upsert(
        {
          content: {
            galleryImages: [{ alt: `${marker} galeria actualizada`, url: asset.publicUrl }],
            mainImageAlt: `${marker} portada actualizada`,
            mainImageUrl: asset.publicUrl,
          },
          html: updatedHtml,
          is_published: publishFixtures,
          kind,
          slug,
          title: `${marker} Trayectoria`,
          translations: delayedPageTranslations,
        },
        { onConflict: "kind" },
      )
      .select("id, html")
      .single(),
    "updating trayectoria test page",
  );
  expect(updatedPage.id === page.id, "Trayectoria upsert created a duplicate page instead of updating it.");
  expect(updatedPage.html === updatedHtml, "Trayectoria upsert did not update the HTML.");
  await assertForeignWritesDenied("site_pages", page.id, "title");

  requireData(await adminClient.from("site_pages").delete().eq("id", page.id), "deleting trayectoria test page");
  await removeAsset(asset);
}

async function testCollectionsAndArtworks() {
  const canvas = await createCollection("canvas");
  const paper = await createCollection("paper");
  const collectionToDelete = await createCollection("canvas", "coleccion-eliminar");
  const canvasPrimaryAsset = await uploadAsset("artworks", "lienzo-principal");
  const canvasSecondaryAsset = await uploadAsset("artworks", "lienzo-secundario");
  const paperAsset = await uploadAsset("artworks", "lamina");
  const collectionDeletePrimaryAsset = await uploadAsset("artworks", "coleccion-eliminar-principal");
  const collectionDeleteSecondaryAsset = await uploadAsset("artworks", "coleccion-eliminar-secundaria");

  const canvasPrimary = await createArtworkWithCover(canvas, canvasPrimaryAsset, "lienzo-principal");
  const canvasSecondary = await createArtworkWithCover(canvas, canvasSecondaryAsset, "lienzo-secundario");
  const paperArtwork = await createArtworkWithCover(paper, paperAsset, "lamina");
  await createArtworkWithCover(collectionToDelete, collectionDeletePrimaryAsset, "coleccion-eliminar-principal");
  await createArtworkWithCover(collectionToDelete, collectionDeleteSecondaryAsset, "coleccion-eliminar-secundaria");

  const [publicCanvas, publicPaper] = await Promise.all([
    readFixture("collections", canvas.id, "cover_image_url, support_kind, translations, artworks(*)"),
    readFixture("collections", paper.id, "cover_image_url, support_kind, translations, artworks(*)"),
  ]);

  expect(publicCanvas.support_kind === "canvas", "Canvas collection support kind was not persisted.");
  expect(publicPaper.support_kind === "paper", "Paper collection support kind was not persisted.");
  expect(publicCanvas.cover_image_url === canvasPrimaryAsset.publicUrl, "First canvas artwork did not become the collection cover.");
  expect(publicCanvas.artworks?.length === 2, "Public canvas collection did not return its artworks.");
  expect(publicPaper.artworks?.length === 1, "Public paper collection did not return its artwork.");
  expect(publicCanvas.translations?.en?.title === collectionTranslations(marker).en.title, "Partial collection translations were not persisted.");
  expect(!publicCanvas.translations?.de, "An empty collection translation should not be created.");
  expect(publicCanvas.artworks?.[0]?.translations?.en?.title, "Partial artwork translations were not persisted.");

  const delayedCollectionTranslations = {
    ...collectionTranslations(marker),
    ca: { title: `${marker} Catala afegit després` },
  };
  const delayedCollection = requireData(
    await adminClient
      .from("collections")
      .update({ translations: delayedCollectionTranslations })
      .eq("id", canvas.id)
      .select("translations")
      .single(),
    "adding a collection translation after creation",
  );
  expect(
    delayedCollection.translations?.ca?.title === delayedCollectionTranslations.ca.title,
    "A delayed collection translation was not saved.",
  );

  const delayedArtworkTranslations = {
    ...artworkTranslations(marker, "lienzo-principal"),
    de: { title: `${marker} Deutsch nachtrag` },
  };
  const delayedArtwork = requireData(
    await adminClient
      .from("artworks")
      .update({ translations: delayedArtworkTranslations })
      .eq("id", canvasPrimary.id)
      .select("translations")
      .single(),
    "adding an artwork translation after creation",
  );
  expect(delayedArtwork.translations?.de?.title === delayedArtworkTranslations.de.title, "A delayed artwork translation was not saved.");

  await check("artwork descriptions preserve paragraphs and independent translations", async () => {
    const description = `${marker} Descripción original.\n\nObra no disponible.\nConsultar al artista.`;
    const translations = {
      ...delayedArtworkTranslations,
      ca: { title: `${marker} Obra catalana`, description: "Descripció catalana.\n\nObra no disponible." },
      en: { ...delayedArtworkTranslations.en, description: "Original description.\n\nArtwork unavailable." },
    };
    requireData(await adminClient.from("artworks").update({ description, translations }).eq("id", canvasPrimary.id).select("id").single(), "saving multiline artwork description");
    const saved = await readFixture("artworks", canvasPrimary.id, "description,translations");
    expect(saved.description === description, "Artwork description lost newlines after saving and reading.");
    expect(saved.translations.ca.description === translations.ca.description, "Catalan description paragraphs were not preserved.");
    expect(saved.translations.en.description === translations.en.description, "English description paragraphs were not preserved.");
    expect(saved.translations.de.title === delayedArtworkTranslations.de.title, "Updating descriptions erased an unrelated translation.");
  });
  await check("hidden artworks are excluded from anonymous reads and remain editable by admin", async () => {
    requireData(await adminClient.from("artworks").update({ is_published: false }).eq("id", canvasPrimary.id).select("id").single(), "hiding artwork");
    for (const [label, client] of [["anonymous", publicClient], ["non-admin", memberClient]]) {
      const rows = requireData(await client.from("artworks").select("id").eq("id", canvasPrimary.id), `reading hidden artwork as ${label}`);
      expect(rows.length === 0, `${label} can read a hidden artwork.`);
    }
    const hidden = requireData(await adminClient.from("artworks").select("is_published").eq("id", canvasPrimary.id).single(), "reading hidden artwork as admin");
    expect(hidden.is_published === false, "Admin did not receive hidden artwork.");
    if (publishFixtures) {
      requireData(await adminClient.from("artworks").update({ is_published: true }).eq("id", canvasPrimary.id).select("id").single(), "republishing isolated test artwork");
      await readFixture("artworks", canvasPrimary.id, "id");
    }
  });
  await assertForeignWritesDenied("artworks", canvasPrimary.id, "description");
  for (const [label, client] of [["anonymous", publicClient], ["non-admin", memberClient]]) {
    // RLS may report a missing hidden row or silently affect zero published rows.
    await client.rpc("delete_artwork_with_cover_refresh", { target_artwork_id: canvasPrimary.id });
    requireData(await adminClient.from("artworks").select("id").eq("id", canvasPrimary.id).single(), `checking ${label} cannot delete artwork through RPC`);
    expect((await getCollectionCover(canvas.id)) === canvasPrimaryAsset.publicUrl, `${label} changed the collection cover through RPC.`);
  }

  await deleteArtworkAndAsset(canvasPrimary, canvasPrimaryAsset);
  expect(
    (await getCollectionCover(canvas.id)) === canvasSecondaryAsset.publicUrl,
    "Deleting the cover artwork did not refresh the collection cover.",
  );

  await deleteArtworkAndAsset(canvasSecondary, canvasSecondaryAsset);
  expect((await getCollectionCover(canvas.id)) === null, "Deleting the final canvas artwork did not clear the collection cover.");

  await deleteArtworkAndAsset(paperArtwork, paperAsset);
  expect((await getCollectionCover(paper.id)) === null, "Deleting the final paper artwork did not clear the collection cover.");

  await deleteCollectionAndAssets(collectionToDelete, [collectionDeletePrimaryAsset, collectionDeleteSecondaryAsset]);

  requireData(
    await adminClient.from("collections").delete().in("id", [canvas.id, paper.id]),
    "deleting test collections",
  );
}

async function testPhotographyFlow() {
  const asset = await uploadAsset("photography", "fotografia");
  const slug = `${marker}-fotografia`;
  const translations = photographyTranslations(marker);
  const sortOrder = await nextSortOrder("photography_items");

  const photo = requireData(
    await adminClient
      .from("photography_items")
      .insert({
        height: 1,
        image_alt: `${marker} fotografia`,
        image_url: asset.publicUrl,
        is_published: publishFixtures,
        slug,
        sort_order: sortOrder,
        title: `${marker} Fotografia`,
        translations,
        width: 1,
      })
      .select("id, sort_order, translations")
      .single(),
    "creating photography item",
  );

  expect(photo.sort_order <= 2_147_483_647, "Photography sort order exceeds the PostgreSQL integer range.");

  const publicPhoto = await readFixture("photography_items", photo.id, "image_url, translations");
  expect(publicPhoto.image_url === asset.publicUrl, "Public client did not receive the uploaded photography URL.");
  expect(publicPhoto.translations?.de?.title === translations.de.title, "Partial photography translations were not persisted.");
  expect(!publicPhoto.translations?.en, "An empty photography translation should not be created.");

  const delayedPhotographyTranslations = {
    ...translations,
    en: { title: `${marker} English added later` },
  };
  const delayedPhoto = requireData(
    await adminClient
      .from("photography_items")
      .update({ translations: delayedPhotographyTranslations })
      .eq("id", photo.id)
      .select("translations")
      .single(),
    "adding a photography translation after creation",
  );
  expect(delayedPhoto.translations?.en?.title === delayedPhotographyTranslations.en.title, "A delayed photography translation was not saved.");
  await assertForeignWritesDenied("photography_items", photo.id, "title");

  requireData(await adminClient.from("photography_items").delete().eq("id", photo.id), "deleting photography item");
  await removeAsset(asset);
}

async function testNewsFlow() {
  const primaryAsset = await uploadAsset("news", "noticia-principal");
  const secondaryAsset = await uploadAsset("news", "noticia-secundaria");
  const slug = `${marker}-noticia`;
  const translations = newsTranslations(marker);
  const sortOrder = await nextSortOrder("news_items");

  const news = requireData(
    await adminClient
      .from("news_items")
      .insert({
        category: "evento",
        date_text: "1 enero 2026",
        description: `${marker} descripcion`,
        external_url: null,
        image_alt: `${marker} noticia`,
        image_url: primaryAsset.publicUrl,
        is_published: publishFixtures,
        location: `${marker} ubicacion`,
        published_at: "2026-01-01",
        slug,
        sort_order: sortOrder,
        title: `${marker} Noticia`,
        translations,
      })
      .select("id, sort_order")
      .single(),
    "creating news item",
  );

  expect(news.sort_order <= 2_147_483_647, "News sort order exceeds the PostgreSQL integer range.");

  requireData(
    await adminClient.from("news_item_images").insert([
      {
        caption: `${marker} primera imagen`,
        image_alt: `${marker} noticia`,
        image_url: primaryAsset.publicUrl,
        is_primary: true,
        news_item_id: news.id,
        sort_order: 1,
        translations: { en: { alt: `${marker} news`, caption: `${marker} first image` } },
      },
      {
        caption: `${marker} segunda imagen`,
        image_alt: `${marker} noticia`,
        image_url: secondaryAsset.publicUrl,
        is_primary: false,
        news_item_id: news.id,
        sort_order: 2,
        translations: { en: { alt: `${marker} news`, caption: `${marker} second image` } },
      },
    ]),
    "creating news images",
  );

  const publicNews = await readFixture("news_items", news.id, "image_url, translations, news_item_images(*)");
  expect(publicNews.image_url === primaryAsset.publicUrl, "Public client did not receive the news primary image.");
  expect(publicNews.news_item_images?.length === 2, "Public client did not receive the news image gallery.");
  expect(publicNews.translations?.en?.title === translations.en.title, "Partial news translations were not persisted.");
  expect(!publicNews.translations?.ca, "An empty news translation should not be created.");

  const delayedNewsTranslations = {
    ...translations,
    ca: { title: `${marker} Catala afegit després` },
  };
  const delayedNews = requireData(
    await adminClient
      .from("news_items")
      .update({ translations: delayedNewsTranslations })
      .eq("id", news.id)
      .select("translations")
      .single(),
    "adding a news translation after creation",
  );
  expect(delayedNews.translations?.ca?.title === delayedNewsTranslations.ca.title, "A delayed news translation was not saved.");
  await assertForeignWritesDenied("news_items", news.id, "title");
  if (!publishFixtures) {
    const images = requireData(await publicClient.from("news_item_images").select("id").eq("news_item_id", news.id), "checking hidden news child image isolation");
    expect(images.length === 0, "Hidden news images are publicly visible.");
  }

  requireData(await adminClient.from("news_items").delete().eq("id", news.id), "deleting news item");
  const remainingImages = requireData(
    await adminClient.from("news_item_images").select("id").eq("news_item_id", news.id),
    "checking news image cascade delete",
  );
  expect(remainingImages.length === 0, "Deleting a news item did not cascade to its image rows.");

  await removeAsset(primaryAsset);
  await removeAsset(secondaryAsset);
}

async function createCollection(supportKind, suffix = supportKind) {
  const slug = `${marker}-${suffix}`;
  const translations = collectionTranslations(marker);
  const collection = requireData(
    await adminClient
      .from("collections")
      .insert({
        cover_image_url: null,
        description: `${marker} descripcion ${supportKind}`,
        is_published: publishFixtures,
        slug,
        sort_order: await nextSortOrder("collections"),
        source: "supabase",
        support_kind: supportKind,
        title: `${marker} ${suffix}`,
        translations,
      })
      .select("id")
      .single(),
    `creating ${supportKind} collection`,
  );

  return { id: collection.id, supportKind };
}

async function createArtworkWithCover(collection, asset, suffix) {
  const sortOrder = await nextSortOrder("artworks", collection.id);
  const artwork = requireData(
    await adminClient
      .from("artworks")
      .insert({
        caption: `${marker} caption ${suffix}`,
        collection_id: collection.id,
        description: `${marker} description ${suffix}`,
        dimensions: "1 x 1 cm",
        height: 1,
        image_url: asset.publicUrl,
        is_published: publishFixtures,
        slug: `${marker}-${suffix}`,
        sort_order: sortOrder,
        source: "supabase",
        source_image_url: asset.publicUrl,
        technique: "Test media",
        title: `${marker} ${suffix}`,
        translations: artworkTranslations(marker, suffix),
        width: 1,
      })
      .select("id")
      .single(),
    `creating artwork ${suffix}`,
  );

  const currentCover = requireData(
    await adminClient.from("collections").select("cover_image_url").eq("id", collection.id).single(),
    `reading ${suffix} collection cover`,
  );

  if (!currentCover.cover_image_url) {
    requireData(
      await adminClient.from("collections").update({ cover_image_url: asset.publicUrl }).eq("id", collection.id),
      `setting first artwork cover for ${suffix}`,
    );
  }

  return { id: artwork.id };
}

async function deleteArtworkAndAsset(artwork, asset) {
  requireData(
    await adminClient.rpc("delete_artwork_with_cover_refresh", { target_artwork_id: artwork.id }),
    "deleting artwork and refreshing cover",
  );
  await removeAsset(asset);
}

async function deleteCollectionAndAssets(collection, assets) {
  requireData(
    await adminClient.from("collections").delete().eq("id", collection.id),
    "deleting collection and cascading artwork rows",
  );

  const remainingArtworks = requireData(
    await adminClient.from("artworks").select("id").eq("collection_id", collection.id),
    "checking collection artwork cascade delete",
  );
  expect(remainingArtworks.length === 0, "Deleting a collection did not cascade to all of its artwork rows.");

  for (const asset of assets) {
    await removeAsset(asset);
  }
}

async function getCollectionCover(collectionId) {
  const collection = requireData(
    await adminClient.from("collections").select("cover_image_url").eq("id", collectionId).single(),
    "reading collection cover",
  );
  return collection.cover_image_url;
}

async function uploadAsset(bucket, label) {
  const storagePath = `e2e/${runId}/${label}.png`;
  const { data } = adminClient.storage.from(bucket).getPublicUrl(storagePath);
  const asset = { bucket, path: storagePath, publicUrl: data.publicUrl };
  // Track before the request: cleanup still runs if an upload succeeds remotely
  // but its response is lost or the following verification fails.
  state.assets.push(asset);
  requireData(
    await adminClient.storage.from(bucket).upload(storagePath, testImage, {
      cacheControl: "0",
      contentType: "image/png",
      upsert: false,
    }),
    `uploading ${bucket}/${label}`,
  );

  const response = await fetch(asset.publicUrl, { signal: AbortSignal.timeout(20_000) });
  expect(response.ok, `Uploaded asset ${bucket}/${label} is not publicly readable.`);
  return asset;
}

async function removeAsset(asset) {
  requireData(await adminClient.storage.from(asset.bucket).remove([asset.path]), `removing ${asset.bucket}/${asset.path}`);

  const directory = asset.path.slice(0, asset.path.lastIndexOf("/"));
  const filename = asset.path.slice(asset.path.lastIndexOf("/") + 1);
  const listed = requireData(
    await adminClient.storage.from(asset.bucket).list(directory, { limit: 100 }),
    `checking storage cleanup for ${asset.bucket}/${asset.path}`,
  );
  expect(!listed.some((item) => item.name === filename), `Storage object ${asset.bucket}/${asset.path} still exists after deletion.`);

  state.assets = state.assets.filter((candidate) => candidate.bucket !== asset.bucket || candidate.path !== asset.path);
}

async function nextSortOrder(table, collectionId) {
  let query = adminClient.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (table === "artworks" && collectionId) {
    query = query.eq("collection_id", collectionId);
  }

  const rows = requireData(
    await query,
    `reading next sort order for ${table}`,
  );
  const current = Number(rows[0]?.sort_order ?? 0);
  const next = Math.max(0, Number.isFinite(current) ? Math.trunc(current) : 0) + 1;
  expect(next <= 2_147_483_647, `No valid integer sort order remains for ${table}.`);
  return next;
}

async function cleanupTestData() {
  const errors = [];

  await cleanupStep(errors, "test news rows", async () => {
    requireData(await serviceClient.from("news_items").delete().like("slug", `${marker}%`), "cleanup news rows");
  });
  await cleanupStep(errors, "test photography rows", async () => {
    requireData(
      await serviceClient.from("photography_items").delete().like("slug", `${marker}%`),
      "cleanup photography rows",
    );
  });
  await cleanupStep(errors, "test artwork rows", async () => {
    requireData(await serviceClient.from("artworks").delete().like("slug", `${marker}%`), "cleanup artwork rows");
  });
  await cleanupStep(errors, "test collection rows", async () => {
    requireData(await serviceClient.from("collections").delete().like("slug", `${marker}%`), "cleanup collection rows");
  });
  await cleanupStep(errors, "test page rows", async () => {
    requireData(await serviceClient.from("site_pages").delete().like("slug", `${marker}%`), "cleanup page rows");
  });
  await cleanupStep(errors, "isolated settings key", async () => {
    requireData(await serviceClient.from("site_settings").delete().like("key", `${marker}%`), "cleanup isolated settings");
  });

  for (const table of ["site_pages", "collections", "artworks", "photography_items", "news_items"]) {
    await cleanupStep(errors, `verify ${table} cleanup`, async () => {
      const rows = requireData(await serviceClient.from(table).select("id").like("slug", `${marker}%`).limit(1), `verifying ${table} cleanup`);
      expect(rows.length === 0, `Fixture rows remain in ${table}.`);
    });
  }
  await cleanupStep(errors, "verify child image cleanup", async () => {
    const rows = requireData(await serviceClient.from("news_item_images").select("id").like("caption", `${marker}%`).limit(1), "verifying news child cleanup");
    expect(rows.length === 0, "Fixture news image rows remain.");
  });
  await cleanupStep(errors, "verify isolated settings cleanup", async () => {
    const rows = requireData(await serviceClient.from("site_settings").select("key").like("key", `${marker}%`), "verifying isolated settings cleanup");
    expect(rows.length === 0, "Isolated settings fixture remains.");
  });

  for (const asset of [...state.assets]) {
    await cleanupStep(errors, `storage object ${asset.bucket}/${asset.path}`, async () => {
      requireData(await serviceClient.storage.from(asset.bucket).remove([asset.path]), "cleanup storage object");
    });
  }
  for (const bucket of ["artworks", "photography", "news", "biography", "site-assets"]) {
    await cleanupStep(errors, `verify ${bucket} storage cleanup`, async () => {
      const files = requireData(await serviceClient.storage.from(bucket).list(`e2e/${runId}`, { limit: 100 }), `verifying ${bucket} test directory`);
      expect(files.length === 0, `Storage objects remain under ${bucket}/e2e/${runId}.`);
    });
  }

  await cleanupStep(errors, "temporary admin grant", async () => {
    requireData(await serviceClient.from("admin_users").delete().in("email", [state.email, state.memberEmail]), "cleanup admin grant");
    const grants = requireData(await serviceClient.from("admin_users").select("email").in("email", [state.email, state.memberEmail]), "verifying admin grant cleanup");
    expect(grants.length === 0, "Temporary administrator grant remains.");
  });

  // Remove the allow-list grant first, then revoke every temporary session
  // before deleting its user. An unexpired JWT alone is not revoked by deleteUser.
  for (const session of state.sessions) {
    await cleanupStep(errors, `temporary ${session.label} session`, async () => {
      requireData(await serviceClient.auth.admin.signOut(session.token, "global"), `revoking ${session.label} refresh tokens`);
      session.revoked = true;
      requireData(await session.client.auth.signOut({ scope: "local" }), `clearing ${session.label} local session`);
    });
  }
  for (const [label, userId] of [["admin", state.userId], ["non-admin", state.memberUserId]]) {
    await cleanupStep(errors, `temporary ${label} Auth user`, async () => {
      if (!userId) return;
      const session = state.sessions.find((candidate) => candidate.label === label);
      expect(!session || session.revoked, `Refusing to delete ${label} before its session is revoked.`);
      requireData(await serviceClient.auth.admin.deleteUser(userId), `deleting ${label} Auth user`);
      const deleted = await serviceClient.auth.admin.getUserById(userId);
      expect(deleted.error?.status === 404 || deleted.error?.code === "user_not_found", `Temporary ${label} Auth user still exists or its deletion could not be verified.`);
    });
  }
  return errors;
}

async function check(name, action) {
  await action();
  passedChecks.push(name);
  console.log(`  ok ${name}`);
}

async function cleanupStep(errors, label, action) {
  try {
    await action();
  } catch (error) {
    errors.push(`${label}: ${asError(error).message}`);
  }
}

function requireData(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

function expect(value, message) {
  if (!value) throw new Error(message);
}

function firstValue(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() ?? "";
}

function asError(error) {
  return error instanceof Error ? error : new Error(String(error));
}

function pageTranslations(value) {
  return {
    en: { html: `<p>${value} english</p>`, title: `${value} English` },
  };
}

function collectionTranslations(value) {
  return {
    en: { title: `${value} English` },
  };
}

function artworkTranslations(value, suffix) {
  return {
    en: { title: `${value} English ${suffix}` },
  };
}

function photographyTranslations(value) {
  return {
    de: { title: `${value} Deutsch` },
  };
}

function newsTranslations(value) {
  return {
    en: { title: `${value} English` },
  };
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
        const separator = line.indexOf("=");
        if (separator <= 0) return [];
        return [[line.slice(0, separator), unquote(line.slice(separator + 1))]];
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

function resolveWebSocketTransport() {
  if (typeof globalThis.WebSocket === "function") return globalThis.WebSocket;
  return WebSocket;
}
