import type { CurrentArtwork } from "../types/currentSite";

export type ArtworkReviewIssue = {
  field: "title" | "dimensions" | "technique" | "image";
  message: string;
};

type ArtworkReviewSource = Pick<CurrentArtwork, "title" | "dimensions" | "technique" | "imageUrl">;

const NUMBER = String.raw`[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)`;
const UNIT = String.raw`(?:mm|cm|m|in(?:ch(?:es)?)?|pulgadas?|["″”])\.?(?![a-z])`;
const SIDE = String.raw`${NUMBER}\s*(?:${UNIT})?`;
const SIDES = new RegExp(String.raw`(?<![\d.,])${SIDE}(?:\s*[x×]\s*${SIDE})+`, "g");
const DIAMETER = new RegExp(String.raw`(?:[ø⌀]|\bdiametro\b)\s*:?(?:\s*de\b)?\s*${SIDE}|(?<![\d.,])${SIDE}\s*(?:[ø⌀]|(?:de\s+)?diametro\b)`, "g");
const FOLLOWING_NOTE = /^(?:de\s+diametro|diametro|diptico|triptico|poliptico|cada|each|por|per|total|totales|overall|conjunto|sin|con|ancho|alto|profundidad|aprox|aproximadamente|approximately)\b/;

/** Advisory only: optional prose, translations and publication flags are not requirements. */
export function getArtworkReviewIssues(artwork: ArtworkReviewSource): ArtworkReviewIssue[] {
  const issues: ArtworkReviewIssue[] = [];
  const title = plainText(artwork.title);
  if (!title) issues.push({ field: "title", message: "Falta el título." });
  else if (isImportedTitle(title)) issues.push({ field: "title", message: "Revisar el título importado." });

  const dimensions = plainText(artwork.dimensions);
  if (!dimensions) issues.push({ field: "dimensions", message: "Faltan las medidas." });
  else if (!hasReadableDimensions(dimensions)) issues.push({ field: "dimensions", message: "Revisar el formato de las medidas." });

  if (!plainText(artwork.technique)) issues.push({ field: "technique", message: "Falta la técnica." });
  if (!plainText(artwork.imageUrl)) issues.push({ field: "image", message: "Falta la imagen." });
  return issues;
}

/** Count affected works once, including hidden works, without changing their data. */
export function getCollectionReviewSummary(collection: { artworks: readonly ArtworkReviewSource[] }): { artworkCount: number; issueCount: number } {
  return collection.artworks.reduce((summary, artwork) => {
    const count = getArtworkReviewIssues(artwork).length;
    return { artworkCount: summary.artworkCount + Number(count > 0), issueCount: summary.issueCount + count };
  }, { artworkCount: 0, issueCount: 0 });
}

function isImportedTitle(title: string): boolean {
  // Camera names actually present in the WordPress export: IMG_33gh,
  // IMG_2089, 016-CIMG2507-scaled and 019-CIMG2518. A title with hyphens,
  // a number, or "Sin título" can be intentional and is not itself a defect.
  return /^(?:\d+[-_\s]+)?(?:cimg|img|dscn?|dscf|pict)[-_\s]*\d[a-z0-9]*(?:[-_\s]+(?:scaled|edited|\d+(?:x\d+)?))*(?:\.(?:jpe?g|png|webp|tiff?))?$/i.test(title);
}

function hasReadableDimensions(value: string): boolean {
  const text = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  // Pixel resolution is not a physical size, even if a legacy import put it here.
  if (/\b(?:px|pixels?|pixeles)\b/.test(text)) return false;

  const measurements = [...text.matchAll(SIDES), ...text.matchAll(DIAMETER)];
  if (!measurements.length) return false;
  return measurements.every((match) => {
    const numbers = match[0].match(new RegExp(NUMBER, "g")) ?? [];
    if (!numbers.length || numbers.some((number) => {
      const numericValue = Number(number.replace(",", "."));
      return !Number.isFinite(numericValue) || numericValue <= 0;
    })) return false;

    const before = text.slice(0, match.index).trimEnd();
    const after = text.slice(match.index! + match[0].length).trimStart();
    // Do not mistake part of a fraction, range, incomplete decimal or third
    // side for a valid pair. Multipart/3-D sizes are fine for editorial review;
    // the separate room-geometry parser remains stricter about physical scale.
    if (/(?:\d[.,]?|[/+-])$/.test(before) || /^(?:\d|[.,]\d|[/+-]|[x×](?:\s|$|[\d+-]))/.test(after)) return false;
    if (/^[a-z]/.test(after) && !FOLLOWING_NOTE.test(after)) return false;
    return true;
  });
}

function plainText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&#(x[\da-f]+|\d+);/gi, (entity, code: string) => {
      const point = code[0].toLowerCase() === "x" ? Number.parseInt(code.slice(1), 16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    })
    .replace(/&(?:nbsp|ensp|emsp|thinsp);/gi, " ")
    .replace(/&times;/gi, "×")
    .replace(/&oslash;/gi, "ø")
    .replace(/&(?:lt|gt);/gi, (entity) => entity.toLowerCase() === "&lt;" ? "<" : ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim();
}
