import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { CurrentArtwork, CurrentPage } from "../types/currentSite";
import type { NewsImage, NewsItem } from "../types/domain";
import type { SupportKind } from "../types/support";
import type {
  ArtworkTranslations,
  CollectionTranslations,
  ImageTranslations,
  NewsTranslations,
  PageTranslations,
  PhotographyTranslations,
} from "../types/localization";

export type EditableCollection = {
  id: string;
  slug: string;
  supportKind: SupportKind;
  title: string;
  description: string;
  coverImageUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  source: "legacy-wordpress" | "supabase";
  translations?: CollectionTranslations;
  artworks: CurrentArtwork[];
};

export type BiographyGalleryImage = {
  url: string;
  alt: string;
  caption?: string | null;
  translations?: ImageTranslations;
};

export type BiographyContent = {
  page: CurrentPage | null;
  mainImageUrl: string;
  mainImageAlt: string;
  galleryImages: BiographyGalleryImage[];
};

export type EditableContentSnapshot = {
  biography: BiographyContent;
  collections: EditableCollection[];
  newsItems: NewsItem[];
  pages: CurrentPage[];
  photoItems: CurrentArtwork[];
};

type SitePageRow = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  html: string;
  content: Record<string, unknown> | null;
  translations?: PageTranslations | null;
  is_published: boolean;
};

type CollectionRow = {
  id: string;
  slug: string;
  support_kind: SupportKind;
  title: string;
  description: string;
  cover_image_url: string | null;
  sort_order: number;
  is_published: boolean;
  source: "legacy-wordpress" | "supabase";
  translations?: CollectionTranslations | null;
  artworks?: ArtworkRow[];
};

type ArtworkRow = {
  id: string;
  collection_id: string;
  slug: string;
  title: string;
  caption: string | null;
  description: string | null;
  technique: string | null;
  dimensions: string | null;
  image_url: string;
  source_image_url: string | null;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_published: boolean;
  translations?: ArtworkTranslations | null;
};

type PhotographyRow = {
  id: string;
  slug: string;
  title: string;
  image_url: string;
  image_alt: string | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_published: boolean;
  translations?: PhotographyTranslations | null;
};

type NewsRow = {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
  date_text: string | null;
  category: NewsItem["category"];
  location: string | null;
  description: string | null;
  external_url: string | null;
  image_url: string | null;
  image_alt: string | null;
  sort_order: number;
  is_published: boolean;
  translations?: NewsTranslations | null;
  news_item_images?: NewsImageRow[];
};

type NewsImageRow = {
  image_url: string;
  image_alt: string | null;
  caption: string | null;
  sort_order: number;
  is_primary: boolean;
  translations?: ImageTranslations | null;
};

type EditableAssetBucket = "artworks" | "photography" | "news" | "biography";
type EditableSortableTable = "collections" | "artworks" | "photography_items" | "news_items";

export function getEditableOperationErrorMessage(
  error: unknown,
  fallback = "No se pudo completar la operación.",
) {
  const message = getErrorMessage(error);
  if (!message) return fallback;

  if (/translations.*schema cache|schema cache.*translations|column ['"]?translations/i.test(message)) {
    return "La base de datos no tiene aplicada la migración de edición contextual. Ejecuta 20260811110000_contextual_editing.sql en el SQL Editor de Supabase y vuelve a intentarlo.";
  }

  if (/row-level security|permission denied|not authorized|insufficient privileges/i.test(message)) {
    return "Tu sesión no tiene permisos de edición. Cierra sesión, vuelve a entrar con el usuario administrador y comprueba la tabla admin_users en Supabase.";
  }

  return message;
}

export async function loadEditableContent(): Promise<EditableContentSnapshot> {
  assertSupabase();
  const client = supabase!;

  const [pagesResult, collectionsResult, photosResult, newsResult] = await Promise.all([
    client.from("site_pages").select("*"),
    client
      .from("collections")
      .select("*, artworks(*)")
      .order("sort_order", { ascending: true })
      .order("sort_order", { referencedTable: "artworks", ascending: true }),
    client.from("photography_items").select("*").order("sort_order", { ascending: true }),
    client
      .from("news_items")
      .select("*, news_item_images(*)")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("sort_order", { ascending: true }),
  ]);

  if (pagesResult.error) throw pagesResult.error;
  if (collectionsResult.error) throw collectionsResult.error;
  if (photosResult.error) throw photosResult.error;
  if (newsResult.error) throw newsResult.error;

  const pageRows = (pagesResult.data ?? []) as SitePageRow[];
  const supabasePages = pageRows.map((row) => mapSitePageRow(row)).filter((page): page is CurrentPage => page !== null);
  const biographyRow = pageRows.find((row) => row.kind === "biography" && row.is_published);
  const biographyPage = biographyRow ? mapBiographyPage(biographyRow) : null;
  const supabaseCollections = (collectionsResult.data ?? []).map((collection) => mapCollectionRow(collection as CollectionRow));
  const supabasePhotos = (photosResult.data ?? []).map((photo) => mapPhotographyRow(photo as PhotographyRow));
  const supabaseNews = (newsResult.data ?? []).map((item) => mapNewsRow(item as NewsRow));

  return {
    biography: biographyPage ?? getEmptyBiographyContent(),
    collections: supabaseCollections,
    newsItems: supabaseNews.sort(sortNewsItems),
    pages: supabasePages,
    photoItems: supabasePhotos.sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function upsertBiography(input: {
  html: string;
  mainImageUrl: string;
  mainImageAlt: string;
  galleryImages: BiographyGalleryImage[];
  translations?: PageTranslations;
}) {
  assertSupabase();

  const { error } = await supabase!
    .from("site_pages")
    .upsert(
      {
        slug: "trayectoria",
        title: "Trayectoria",
        kind: "biography",
        html: input.html,
        content: {
          mainImageUrl: input.mainImageUrl,
          mainImageAlt: input.mainImageAlt,
          galleryImages: input.galleryImages,
        },
        translations: input.translations ?? {},
        is_published: true,
      },
      { onConflict: "kind" },
    );

  if (error) throw error;
}

export async function createCollection(input: {
  supportKind: SupportKind;
  title: string;
  description: string;
  translations?: CollectionTranslations;
}) {
  assertSupabase();
  const [slug, sortOrder] = await Promise.all([
    getUniqueSlug("collections", input.title),
    getNextSortOrder("collections"),
  ]);

  const { data, error } = await supabase!
    .from("collections")
    .insert({
      slug,
      support_kind: input.supportKind,
      title: input.title.trim(),
      description: input.description.trim(),
      translations: input.translations ?? {},
      sort_order: sortOrder,
      is_published: true,
      source: "supabase",
    })
    .select("id, slug")
    .single();

  if (error) throw error;
  return data as { id: string; slug: string };
}

export async function updateCollection(input: {
  id: string;
  title: string;
  description: string;
  translations?: CollectionTranslations;
}) {
  assertSupabase();

  const { data, error } = await supabase!
    .from("collections")
    .update({
      title: input.title.trim(),
      description: input.description.trim(),
      translations: input.translations ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No se encontró la colección que querías actualizar.");
}

export async function deleteCollection(input: { id: string }) {
  assertSupabase();
  const client = supabase!;

  // Read asset references before the cascading database delete removes the artwork rows.
  const { data: artworkAssets, error: artworkAssetsError } = await client
    .from("artworks")
    .select("image_url, source_image_url, thumbnail_url")
    .eq("collection_id", input.id);

  if (artworkAssetsError) throw artworkAssetsError;

  const { data, error } = await client.from("collections").delete().eq("id", input.id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No se encontró la colección que querías eliminar.");

  const imageUrls = ((artworkAssets ?? []) as Array<Pick<ArtworkRow, "image_url" | "source_image_url" | "thumbnail_url">>)
    .flatMap((artwork) => [artwork.image_url, artwork.source_image_url, artwork.thumbnail_url])
    .filter((url): url is string => typeof url === "string" && url.length > 0);

  await cleanupOwnedEditableAssets(imageUrls);
}

export async function createArtwork(input: {
  collectionId: string;
  title: string;
  caption: string;
  description: string;
  technique: string;
  dimensions: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  translations?: ArtworkTranslations;
}) {
  assertSupabase();
  const [slug, sortOrder] = await Promise.all([
    getUniqueSlug("artworks", input.title, input.collectionId),
    getNextSortOrder("artworks", input.collectionId),
  ]);

  const { data, error } = await supabase!
    .from("artworks")
    .insert({
      collection_id: input.collectionId,
      slug,
      title: input.title.trim(),
      caption: input.caption.trim(),
      description: input.description.trim(),
      technique: input.technique.trim() || null,
      dimensions: input.dimensions.trim() || null,
      image_url: input.imageUrl,
      source_image_url: input.imageUrl,
      width: input.width,
      height: input.height,
      translations: input.translations ?? {},
      sort_order: sortOrder,
      is_published: true,
      source: "supabase",
    })
    .select("id")
    .single();

  if (error) throw error;

  const { data: collection, error: collectionError } = await supabase!
    .from("collections")
    .select("cover_image_url")
    .eq("id", input.collectionId)
    .single();

  if (collectionError) {
    await rollbackArtwork(data.id);
    throw collectionError;
  }

  if (!collection.cover_image_url) {
    const { error: updateError } = await supabase!
      .from("collections")
      .update({ cover_image_url: input.imageUrl })
      .eq("id", input.collectionId);

    if (updateError) {
      await rollbackArtwork(data.id);
      throw updateError;
    }
  }

  return data as { id: string };
}

export async function updateArtwork(input: {
  id: string;
  title: string;
  caption: string;
  description: string;
  technique: string;
  dimensions: string;
  translations?: ArtworkTranslations;
}) {
  assertSupabase();

  const { data, error } = await supabase!
    .from("artworks")
    .update({
      title: input.title.trim(),
      caption: input.caption.trim(),
      description: input.description.trim(),
      technique: input.technique.trim() || null,
      dimensions: input.dimensions.trim() || null,
      translations: input.translations ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No se encontró la obra que querías actualizar.");
}

export async function createPhotographyItem(input: {
  title: string;
  imageUrl: string;
  imageAlt: string;
  width: number | null;
  height: number | null;
  translations?: PhotographyTranslations;
}) {
  assertSupabase();
  const [slug, sortOrder] = await Promise.all([
    getUniqueSlug("photography_items", input.title),
    getNextSortOrder("photography_items"),
  ]);

  const { error } = await supabase!.from("photography_items").insert({
    slug,
    title: input.title.trim(),
    image_url: input.imageUrl,
    image_alt: input.imageAlt.trim() || input.title.trim(),
    width: input.width,
    height: input.height,
    translations: input.translations ?? {},
    sort_order: sortOrder,
    is_published: true,
  });

  if (error) throw error;
}

export async function updatePhotographyItem(input: {
  id: string;
  title: string;
  imageAlt: string;
  translations?: PhotographyTranslations;
}) {
  assertSupabase();

  const { data, error } = await supabase!
    .from("photography_items")
    .update({
      title: input.title.trim(),
      image_alt: input.imageAlt.trim() || input.title.trim(),
      translations: input.translations ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No se encontró la fotografía que querías actualizar.");
}

export async function createNewsItem(input: {
  title: string;
  publishedAt: string;
  dateText: string;
  category: NewsItem["category"];
  location: string;
  description: string;
  externalUrl: string;
  imageAlt: string;
  imageUrls: string[];
  translations?: NewsTranslations;
}) {
  assertSupabase();
  const [slug, sortOrder] = await Promise.all([
    getUniqueSlug("news_items", input.title),
    getNextSortOrder("news_items"),
  ]);
  const [primaryImageUrl] = input.imageUrls;
  const { data, error } = await supabase!
    .from("news_items")
    .insert({
      slug,
      title: input.title.trim(),
      published_at: input.publishedAt || null,
      date_text: input.dateText.trim() || null,
      category: input.category,
      location: input.location.trim() || null,
      description: input.description.trim() || null,
      external_url: input.externalUrl.trim() || null,
      image_url: primaryImageUrl ?? null,
      image_alt: input.imageAlt.trim() || input.title.trim(),
      translations: input.translations ?? {},
      sort_order: sortOrder,
      is_published: true,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (input.imageUrls.length > 0) {
    const { error: imageError } = await supabase!.from("news_item_images").insert(
      input.imageUrls.map((url, index) => ({
        news_item_id: data.id,
        image_url: url,
        image_alt: input.imageAlt.trim() || input.title.trim(),
        sort_order: index + 1,
        is_primary: index === 0,
      })),
    );

    if (imageError) {
      await supabase!.from("news_items").delete().eq("id", data.id);
      throw imageError;
    }
  }
}

export async function updateNewsItem(input: {
  id: string;
  title: string;
  publishedAt: string;
  dateText: string;
  category: NewsItem["category"];
  location: string;
  description: string;
  externalUrl: string;
  imageAlt: string;
  translations?: NewsTranslations;
}) {
  assertSupabase();

  const { data, error } = await supabase!
    .from("news_items")
    .update({
      title: input.title.trim(),
      published_at: input.publishedAt || null,
      date_text: input.dateText.trim() || null,
      category: input.category,
      location: input.location.trim() || null,
      description: input.description.trim() || null,
      external_url: input.externalUrl.trim() || null,
      image_alt: input.imageAlt.trim() || input.title.trim(),
      translations: input.translations ?? {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("No se encontró la noticia que querías actualizar.");
}

export async function deleteNewsItem(input: { id: string; imageUrls: string[] }) {
  assertSupabase();
  const { error } = await supabase!.from("news_items").delete().eq("id", input.id);
  if (error) throw error;
  await cleanupOwnedEditableAssets(input.imageUrls);
}

export async function deletePhotographyItem(input: { id: string; imageUrl: string }) {
  assertSupabase();
  const { error } = await supabase!.from("photography_items").delete().eq("id", input.id);
  if (error) throw error;
  await cleanupOwnedEditableAssets([input.imageUrl]);
}

export async function deleteArtwork(input: { id: string; imageUrl: string }) {
  assertSupabase();
  const { error } = await supabase!.rpc("delete_artwork_with_cover_refresh", {
    target_artwork_id: input.id,
  });
  if (error) throw error;
  await cleanupOwnedEditableAssets([input.imageUrl]);
}

export async function uploadEditableAsset(bucket: EditableAssetBucket, file: File) {
  assertSupabase();
  assertEditableImage(file);

  const extension = getImageExtension(file);
  const safeName = createSlug(file.name.replace(/\.[^.]+$/, "")) || "imagen";
  const path = `${new Date().toISOString().slice(0, 10)}/${safeName}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase!.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase!.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadEditableAssets(bucket: EditableAssetBucket, files: Iterable<File>) {
  const uploadedUrls: string[] = [];

  try {
    for (const file of files) {
      uploadedUrls.push(await uploadEditableAsset(bucket, file));
    }
    return uploadedUrls;
  } catch (error) {
    await cleanupOwnedEditableAssets(uploadedUrls);
    throw error;
  }
}

export async function getImageDimensions(file: File): Promise<{ width: number | null; height: number | null }> {
  if (!file.type.startsWith("image/")) return { width: null, height: null };

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null });
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: null, height: null });
    };
    image.src = objectUrl;
  });
}

export async function cleanupOwnedEditableAssets(urls: string[]) {
  if (!supabase) return;

  const byBucket = new Map<EditableAssetBucket, string[]>();
  for (const url of new Set(urls)) {
    const reference = getOwnedEditableAssetReference(url);
    if (!reference) continue;
    const paths = byBucket.get(reference.bucket) ?? [];
    paths.push(reference.path);
    byBucket.set(reference.bucket, paths);
  }

  await Promise.all(
    [...byBucket.entries()].map(async ([bucket, paths]) => {
      const { error } = await supabase!.storage.from(bucket).remove(paths);
      if (error) {
        // The content has already been removed. Retaining an orphan asset is safer than failing its deletion action.
        console.warn(`No se pudo limpiar un activo de ${bucket}.`, error.message);
      }
    }),
  );
}

export function getEmptyEditableContentSnapshot(): EditableContentSnapshot {
  return {
    biography: getEmptyBiographyContent(),
    collections: [],
    newsItems: [],
    pages: [],
    photoItems: [],
  };
}

function getEmptyBiographyContent(): BiographyContent {
  return {
    page: null,
    mainImageUrl: "",
    mainImageAlt: "",
    galleryImages: [],
  };
}

function mapSitePageRow(row: SitePageRow): CurrentPage | null {
  if (!isCurrentPageKind(row.kind) || !row.is_published) return null;

  const pagePath = getPagePath(row.kind);

  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    legacyPath: pagePath,
    appPath: pagePath,
    sourceUrl: "",
    title: row.title,
    html: row.html,
    text: row.html.replace(/<[^>]*>/g, " "),
    isPublished: row.is_published,
    translations: getTranslations<PageTranslations>(row.translations),
  };
}

function mapBiographyPage(row: SitePageRow): BiographyContent {
  const content = row.content ?? {};
  const galleryImages = Array.isArray(content.galleryImages) ? content.galleryImages.filter(isGalleryImage) : [];

  return {
    page: {
      id: row.id,
      slug: row.slug,
      kind: "biography",
      legacyPath: "/trayectoria",
      appPath: "/trayectoria",
      sourceUrl: "",
      title: row.title,
      html: row.html,
      text: row.html.replace(/<[^>]*>/g, " "),
      isPublished: row.is_published,
      translations: getTranslations<PageTranslations>(row.translations),
    },
    mainImageUrl: typeof content.mainImageUrl === "string" ? content.mainImageUrl : "",
    mainImageAlt: typeof content.mainImageAlt === "string" ? content.mainImageAlt : "",
    galleryImages,
  };
}

function mapCollectionRow(row: CollectionRow): EditableCollection {
  const artworks = [...(row.artworks ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((artwork) => mapArtworkRow(artwork, row.slug));

  return {
    id: row.id,
    slug: row.slug,
    supportKind: row.support_kind,
    title: row.title,
    description: row.description,
    coverImageUrl: row.cover_image_url ?? artworks[0]?.imageUrl ?? null,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    source: row.source ?? "supabase",
    translations: getTranslations<CollectionTranslations>(row.translations),
    artworks,
  };
}

function mapArtworkRow(row: ArtworkRow, collectionSlug: string): CurrentArtwork {
  return {
    id: row.id,
    collectionSlug,
    slug: row.slug,
    title: row.title,
    caption: row.caption ?? "",
    description: row.description ?? "",
    technique: row.technique,
    dimensions: row.dimensions,
    imageUrl: row.image_url,
    sourceImageUrl: row.source_image_url ?? row.image_url,
    thumbnailUrl: row.thumbnail_url,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    translations: getTranslations<ArtworkTranslations>(row.translations),
  };
}

function mapPhotographyRow(row: PhotographyRow): CurrentArtwork {
  return {
    id: row.id,
    collectionSlug: "fotografia",
    slug: row.slug,
    title: row.title,
    caption: "",
    description: "",
    technique: null,
    dimensions: null,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    sourceImageUrl: row.image_url,
    thumbnailUrl: null,
    width: row.width,
    height: row.height,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    translations: getTranslations<PhotographyTranslations>(row.translations),
  };
}

function mapNewsRow(row: NewsRow): NewsItem {
  const images = [...(row.news_item_images ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(
      (image): NewsImage => ({
        url: image.image_url,
        alt: image.image_alt,
        caption: image.caption,
        translations: getTranslations<ImageTranslations>(image.translations),
      }),
    );

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    publishedAt: row.published_at,
    dateText: row.date_text,
    category: row.category,
    location: row.location,
    description: row.description,
    externalUrl: row.external_url,
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    images,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    translations: getTranslations<NewsTranslations>(row.translations),
  };
}

function sortNewsItems(a: NewsItem, b: NewsItem) {
  const aTime = a.publishedAt ? new Date(`${a.publishedAt}T00:00:00`).getTime() : 0;
  const bTime = b.publishedAt ? new Date(`${b.publishedAt}T00:00:00`).getTime() : 0;
  if (aTime !== bTime) return bTime - aTime;
  return a.sortOrder - b.sortOrder;
}

function isCurrentPageKind(value: string): value is CurrentPage["kind"] {
  return value === "home" || value === "news_index" || value === "biography" || value === "contact";
}

function getPagePath(kind: CurrentPage["kind"]) {
  if (kind === "home") return "/";
  if (kind === "news_index") return "/noticias";
  if (kind === "biography") return "/trayectoria";
  return "/contacto";
}

function assertSupabase() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase no está configurado. Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.");
  }
}

function assertEditableImage(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecciona un archivo de imagen válido.");
  }

  if (file.size > 25 * 1024 * 1024) {
    throw new Error("Cada imagen debe ocupar como máximo 25 MB.");
  }
}

function getImageExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return extension || "jpg";
}

async function getUniqueSlug(table: "collections" | "artworks" | "photography_items" | "news_items", value: string, collectionId?: string) {
  const base = createSlug(value) || "contenido";
  let query = supabase!.from(table).select("slug").like("slug", `${base}%`);
  if (table === "artworks" && collectionId) {
    query = query.eq("collection_id", collectionId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const existingSlugs = new Set((data ?? []).map((item) => String((item as { slug: string }).slug)));
  if (!existingSlugs.has(base)) return base;

  let suffix = 2;
  while (existingSlugs.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

async function getNextSortOrder(table: EditableSortableTable, collectionId?: string) {
  let query = supabase!.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (table === "artworks" && collectionId) {
    query = query.eq("collection_id", collectionId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const current = Number((data?.[0] as { sort_order?: unknown } | undefined)?.sort_order ?? 0);
  const next = Math.max(0, Number.isFinite(current) ? Math.trunc(current) : 0) + 1;

  if (next > 2_147_483_647) {
    throw new Error("No se puede asignar un orden valido al nuevo contenido.");
  }

  return next;
}

async function rollbackArtwork(artworkId: string) {
  const { error } = await supabase!.from("artworks").delete().eq("id", artworkId);
  if (error) {
    console.warn("No se pudo revertir una obra incompleta.", error.message);
  }
}

function getOwnedEditableAssetReference(url: string): { bucket: EditableAssetBucket; path: string } | null {
  try {
    const parsed = new URL(url);
    const bucket = (["artworks", "photography", "news", "biography"] as const).find((candidate) =>
      parsed.pathname.startsWith(`/storage/v1/object/public/${candidate}/`),
    );
    if (!bucket) return null;

    const marker = `/storage/v1/object/public/${bucket}/`;
    const path = decodeURIComponent(parsed.pathname.slice(marker.length));
    if (!path || path.startsWith("legacy/")) return null;

    return { bucket, path };
  } catch {
    return null;
  }
}

function getTranslations<T extends object>(value: unknown): T | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as T) : undefined;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return "";
}

export function createSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function isGalleryImage(value: unknown): value is BiographyGalleryImage {
  return (
    typeof value === "object" &&
    value !== null &&
    "url" in value &&
    typeof value.url === "string" &&
    "alt" in value &&
    typeof value.alt === "string"
  );
}
