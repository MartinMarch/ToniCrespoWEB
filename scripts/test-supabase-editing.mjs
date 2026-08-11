import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const env = { ...readEnvFile(path.join(rootDir, ".env")), ...process.env };

if (!args.has("--run") && env.SUPABASE_TEST_RUN !== "true") {
  throw new Error(
    "Esta prueba crea datos temporales en Supabase. Ejecuta npm run test:supabase -- --run para confirmarlo.",
  );
}

const config = {
  url: firstValue(env.SUPABASE_TEST_URL, env.VITE_SUPABASE_URL),
  anonKey: firstValue(env.SUPABASE_TEST_ANON_KEY, env.VITE_SUPABASE_ANON_KEY),
  serviceRoleKey: firstValue(
    env.SUPABASE_TEST_SERVICE_ROLE_KEY,
    env.SUPABASE_TEST_SECRET_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.SUPABASE_SECRET_KEY,
    env.SUPABASE_SERVICE_KEY,
    env.SERVICE_ROLE_KEY,
  ),
};

if (!config.url || !config.anonKey || !config.serviceRoleKey) {
  throw new Error(
    "Faltan claves de prueba. Define SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY y SUPABASE_TEST_SERVICE_ROLE_KEY, o las variables equivalentes de .env.",
  );
}

const clientOptions = {
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
const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const marker = `e2e-tonicrespo-${runId}`;
const state = {
  assets: [],
  email: `${marker}@tests.invalid`,
  userId: null,
};
const passedChecks = [];
const testImage = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7NwAAAABJRU5ErkJggg==",
  "base64",
);

console.log(`Supabase integration target: ${new URL(config.url).host}`);
console.log(`Test run: ${marker}`);

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
  await check("RLS rejects unauthenticated writes", assertAnonymousWriteIsRejected);
  await check("Trayectoria content, translations and biography storage", testBiographyFlow);
  await check("Lienzos and Laminas collections, artwork cover refresh, collection cascade and storage", testCollectionsAndArtworks);
  await check("Fotografia insert, public read, delete and storage cleanup", testPhotographyFlow);
  await check("Noticias insert, public read, child images, delete and storage cleanup", testNewsFlow);
}

async function assertRequiredSchema() {
  const slug = `${marker}-schema`;
  const kind = `${marker}-schema`;
  const { data, error } = await serviceClient
    .from("site_pages")
    .upsert(
      {
        content: {},
        html: "<p>schema probe</p>",
        is_published: false,
        kind,
        slug,
        title: "Schema probe",
        translations: { en: { html: "<p>schema probe</p>", title: "Schema probe" } },
      },
      { onConflict: "kind" },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(
      `Supabase does not have the contextual editing schema. Run supabase/migrations/20260811110000_contextual_editing.sql in the target project. Original error: ${error.message}`,
    );
  }

  requireData(await serviceClient.from("site_pages").delete().eq("id", data.id), "removing schema probe");
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

  const isAdmin = requireData(await adminClient.rpc("is_admin"), "checking is_admin");
  expect(isAdmin === true, "Temporary user is authenticated but does not have admin access.");
}

async function assertAnonymousWriteIsRejected() {
  const { error } = await publicClient.from("collections").insert({
    description: "This row must be rejected by RLS.",
    is_published: true,
    slug: `${marker}-anonymous-denied`,
    sort_order: 1,
    source: "supabase",
    support_kind: "canvas",
    title: `${marker} anonymous denied`,
    translations: {},
  });

  expect(error, "An unauthenticated client could insert a collection. Review RLS policies.");
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
          is_published: true,
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

  const publicPage = requireData(
    await publicClient
      .from("site_pages")
      .select("content, html, translations")
      .eq("id", page.id)
      .single(),
    "reading trayectoria test page as public client",
  );
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
          is_published: true,
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
    requireData(
      await publicClient.from("collections").select("cover_image_url, support_kind, translations, artworks(*) ").eq("id", canvas.id).single(),
      "reading canvas collection as public client",
    ),
    requireData(
      await publicClient.from("collections").select("cover_image_url, support_kind, translations, artworks(*) ").eq("id", paper.id).single(),
      "reading paper collection as public client",
    ),
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
        is_published: true,
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

  const publicPhoto = requireData(
    await publicClient.from("photography_items").select("image_url, translations").eq("id", photo.id).single(),
    "reading photography item as public client",
  );
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
        is_published: true,
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

  const publicNews = requireData(
    await publicClient
      .from("news_items")
      .select("image_url, translations, news_item_images(*)")
      .eq("id", news.id)
      .single(),
    "reading news item and images as public client",
  );
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
        is_published: true,
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
        is_published: true,
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
  requireData(
    await adminClient.storage.from(bucket).upload(storagePath, testImage, {
      cacheControl: "0",
      contentType: "image/png",
      upsert: false,
    }),
    `uploading ${bucket}/${label}`,
  );

  const { data } = adminClient.storage.from(bucket).getPublicUrl(storagePath);
  const asset = { bucket, path: storagePath, publicUrl: data.publicUrl };
  state.assets.push(asset);

  const response = await fetch(asset.publicUrl);
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

  for (const asset of [...state.assets]) {
    await cleanupStep(errors, `storage object ${asset.bucket}/${asset.path}`, async () => {
      requireData(await serviceClient.storage.from(asset.bucket).remove([asset.path]), "cleanup storage object");
    });
  }

  await cleanupStep(errors, "temporary admin session", async () => {
    requireData(await adminClient.auth.signOut(), "signing out temporary admin");
  });
  await cleanupStep(errors, "temporary admin grant", async () => {
    requireData(await serviceClient.from("admin_users").delete().eq("email", state.email), "cleanup admin grant");
  });
  await cleanupStep(errors, "temporary Auth user", async () => {
    if (!state.userId) return;
    requireData(await serviceClient.auth.admin.deleteUser(state.userId), "cleanup Auth user");
  });
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
