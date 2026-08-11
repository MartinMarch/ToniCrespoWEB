export const contentLocales = ["en", "de", "ca"] as const;

export type ContentLocale = (typeof contentLocales)[number];

export type LocalizedFields<T extends object> = Partial<Record<ContentLocale, Partial<T>>>;

export type PageTranslations = LocalizedFields<{
  html: string;
  title: string;
}>;

export type NewsTranslations = LocalizedFields<{
  dateText: string | null;
  description: string | null;
  imageAlt: string | null;
  location: string | null;
  title: string;
}>;

export type ImageTranslations = LocalizedFields<{
  alt: string | null;
  caption: string | null;
}>;

export type CollectionTranslations = LocalizedFields<{
  description: string;
  title: string;
}>;

export type ArtworkTranslations = LocalizedFields<{
  caption: string;
  description: string;
  technique: string | null;
  title: string;
}>;

export type PhotographyTranslations = LocalizedFields<{
  imageAlt: string | null;
  title: string;
}>;
