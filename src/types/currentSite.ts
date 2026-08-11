import type { ArtworkTranslations, PageTranslations, PhotographyTranslations } from "./localization";

export type CurrentArtwork = {
  id: string;
  collectionSlug: string;
  slug: string;
  title: string;
  caption: string;
  description: string;
  technique: string | null;
  dimensions: string | null;
  imageUrl: string;
  imageAlt?: string | null;
  sourceImageUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  sortOrder: number;
  isPublished: boolean;
  translations?: ArtworkTranslations | PhotographyTranslations;
};

export type CurrentPage = {
  id: string;
  slug: string;
  kind: "home" | "news_index" | "biography" | "contact";
  legacyPath: string;
  appPath: string;
  sourceUrl: string;
  title: string;
  html: string;
  text: string;
  isPublished: boolean;
  translations?: PageTranslations;
};
