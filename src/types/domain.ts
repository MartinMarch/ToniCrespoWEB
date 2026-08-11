export type Collection = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  source?: "legacy-wordpress" | "manual" | "supabase";
};

export type Artwork = {
  id: string;
  collectionId: string;
  slug: string;
  title: string;
  description: string | null;
  year: string | null;
  technique: string | null;
  dimensions: string | null;
  status: string | null;
  primaryImageUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  source?: "legacy-wordpress" | "manual" | "supabase";
};

export type ArtworkImage = {
  id: string;
  artworkId: string;
  storagePath: string;
  publicUrl: string | null;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  isPrimary: boolean;
};

export type SitePage = {
  id: string;
  slug: string;
  title: string;
  kind: "home" | "works_index" | "photography" | "news_index" | "biography" | "contact" | "generic";
  content: Record<string, unknown>;
  seoTitle: string | null;
  seoDescription: string | null;
  isPublished: boolean;
};

export type NewsImage = {
  url: string;
  alt: string | null;
  caption?: string | null;
  translations?: ImageTranslations;
};

export type NewsItem = {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  dateText: string | null;
  category: "exposicion" | "premio" | "entrevista" | "publicacion" | "evento" | "television";
  location: string | null;
  description: string | null;
  externalUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  images?: NewsImage[];
  sortOrder: number;
  isPublished: boolean;
  translations?: NewsTranslations;
};
import type { ImageTranslations, NewsTranslations } from "./localization";
