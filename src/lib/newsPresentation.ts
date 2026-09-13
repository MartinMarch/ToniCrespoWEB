import type { SiteLanguage } from "../app/sitePreferences";
import type { NewsImage, NewsItem } from "../types/domain";

export const newsCategoryValues: NewsItem["category"][] = ["exposicion", "premio", "entrevista", "publicacion", "evento", "television"];
export const newsCategoryLabels: Record<SiteLanguage, Record<NewsItem["category"], string>> = {
  es: { exposicion: "Exposición", premio: "Premio", entrevista: "Entrevista", publicacion: "Publicación", evento: "Evento", television: "Televisión" },
  ca: { exposicion: "Exposició", premio: "Premi", entrevista: "Entrevista", publicacion: "Publicació", evento: "Esdeveniment", television: "Televisió" },
  en: { exposicion: "Exhibition", premio: "Award", entrevista: "Interview", publicacion: "Publication", evento: "Event", television: "Television" },
  de: { exposicion: "Ausstellung", premio: "Auszeichnung", entrevista: "Interview", publicacion: "Publikation", evento: "Veranstaltung", television: "Fernsehen" },
};

export const newsCopy = {
  es: { filters: "Filtros", results: "noticias", result: "noticia", visit: "Visitar la noticia", images: "Imágenes de", previous: "Imagen anterior", next: "Imagen siguiente", view: "Ver imagen", enlarge: "Ampliar imagen", gallery: "Galería de imágenes", dateRange: "La fecha «Desde» no puede ser posterior a «Hasta»." },
  ca: { filters: "Filtres", results: "notícies", result: "notícia", visit: "Visitar la notícia", images: "Imatges de", previous: "Imatge anterior", next: "Imatge següent", view: "Veure imatge", enlarge: "Ampliar imatge", gallery: "Galeria d’imatges", dateRange: "La data «Des de» no pot ser posterior a «Fins a»." },
  en: { filters: "Filters", results: "news items", result: "news item", visit: "Read the full story", images: "Images for", previous: "Previous image", next: "Next image", view: "View image", enlarge: "Enlarge image", gallery: "Image gallery", dateRange: "The start date cannot be after the end date." },
  de: { filters: "Filter", results: "Beiträge", result: "Beitrag", visit: "Nachricht ansehen", images: "Bilder zu", previous: "Vorheriges Bild", next: "Nächstes Bild", view: "Bild anzeigen", enlarge: "Bild vergrößern", gallery: "Bildergalerie", dateRange: "Das Startdatum darf nicht nach dem Enddatum liegen." },
};

/** Editorial links only: never render executable or credential-bearing URLs. */
export function getNewsExternalUrl(value?: string | null): string | null {
  const candidate = value?.trim();
  if (!candidate || /[\u0000-\u001f\u007f\\]/.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && url.hostname && !url.username && !url.password ? candidate : null;
  } catch { return null; }
}

export function getNewsImages(item: NewsItem): NewsImage[] {
  if (item.images?.length) return item.images;
  return item.imageUrl ? [{ url: item.imageUrl, alt: item.imageAlt }] : [];
}

export function normalizeNewsSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function getNewsDate(item: NewsItem, language: SiteLanguage) {
  if (item.dateText?.trim()) return item.dateText;
  if (!item.publishedAt) return "";
  const date = new Date(`${item.publishedAt.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric" }).format(date);
}
