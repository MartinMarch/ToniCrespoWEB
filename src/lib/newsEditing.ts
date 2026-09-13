import { getNewsExternalUrl, newsCategoryValues } from "./newsPresentation";
import type { NewsImage, NewsItem } from "../types/domain";
import type { NewsTranslations } from "../types/localization";

export type NewsEditingFields = {
  title: string;
  publishedAt: string;
  dateText: string;
  category: NewsItem["category"];
  location: string;
  description: string;
  externalUrl: string;
  imageAlt: string;
  translations?: NewsTranslations;
};

function invalid(message: string): never {
  throw Object.assign(new Error(message), { code: "22023" });
}

function optionalText(value: string, label: string): string | null {
  if (typeof value !== "string") invalid(`Revisa ${label} de la noticia.`);
  return value.trim() || null;
}

function translations(value: unknown): Record<string, Record<string, string | null>> {
  const candidate = value === undefined ? {} : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) invalid("Revisa las traducciones de la noticia.");
  for (const fields of Object.values(candidate)) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)
      || Object.values(fields).some(field => field !== null && typeof field !== "string")) {
      invalid("Revisa las traducciones de la noticia.");
    }
  }
  return candidate as Record<string, Record<string, string | null>>;
}

export function buildNewsMetadata(input: NewsEditingFields) {
  const title = optionalText(input.title, "el título");
  if (!title) invalid("Escribe un título para la noticia.");
  const publishedAt = optionalText(input.publishedAt, "la fecha");
  if (publishedAt) {
    const date = new Date(`${publishedAt}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publishedAt) || publishedAt.startsWith("0000")
      || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== publishedAt) {
      invalid("La fecha de la noticia no es válida.");
    }
  }
  if (!newsCategoryValues.includes(input.category)) invalid("Escoge una categoría válida para la noticia.");
  const externalUrl = optionalText(input.externalUrl, "el enlace");
  if (externalUrl && !getNewsExternalUrl(externalUrl)) invalid("El enlace de la noticia debe ser una dirección http o https válida, sin credenciales.");
  return {
    title,
    published_at: publishedAt,
    date_text: optionalText(input.dateText, "el texto de la fecha"),
    category: input.category,
    location: optionalText(input.location, "la ubicación"),
    description: optionalText(input.description, "la descripción"),
    external_url: externalUrl,
    image_alt: optionalText(input.imageAlt, "el texto alternativo") || title,
    translations: translations(input.translations),
  };
}

export function buildNewsImageItems(images: NewsImage[]) {
  if (!Array.isArray(images)) invalid("Revisa las imágenes de la noticia.");
  return images.map(image => {
    if (!image || typeof image.url !== "string" || !getNewsExternalUrl(image.url)) invalid("Una imagen de la noticia no tiene una dirección http o https válida.");
    if (image.caption !== undefined && image.caption !== null && typeof image.caption !== "string") invalid("Revisa el pie de foto de la noticia.");
    return {
      image_url: image.url.trim(),
      // Captions and localized text may intentionally contain paragraph spacing.
      caption: image.caption ?? null,
      translations: translations(image.translations),
    };
  });
}
