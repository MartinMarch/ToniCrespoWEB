import type { CurrentArtwork } from "../types/currentSite";

/** All coordinates are percentages of the uncropped room photograph. */
export type RoomScene = {
  id: string;
  labelKey: string;
  backgroundUrl: string;
  imageAspectRatio: number;
  wall: { left: number; top: number; right: number; bottom: number };
  /** A visible furniture reference, measured in the final background image. */
  reference: { widthCm: number; imageWidthPercent: number };
  artworkCenter: { x: number; y: number };
  brightness: number;
  sizeRange: { min: number; max: number };
};

export type ArtworkMetrics = {
  ratio: number;
  widthCm: number | null;
  heightCm: number | null;
  longestCm: number | null;
};

export type ArtworkPlacement = {
  /** Horizontal center and top edge, suitable for translateX(-50%). */
  x: number;
  y: number;
  width: number;
  height: number;
  fits: boolean;
  isEstimated: boolean;
};

type ArtworkGeometrySource = Pick<CurrentArtwork, "dimensions" | "description" | "caption" | "width" | "height">;
type PhysicalDimensions = { width: number; height: number };

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const UNIT = String.raw`(?:mm|cm|m|in(?:ch(?:es)?)?|pulgadas?|["″”])\.?(?![a-zà-ÿ])`;
const PAIR = String.raw`(?<![\d.,+\-/])(${NUMBER})\s*(${UNIT})?\s*[x×]\s*(${NUMBER})\s*(${UNIT})?`;
const PER_PANEL = /\b(?:cada|each|por\s+(?:pieza|panel|tablilla)|per\s+(?:piece|panel))\b|\b\d+\s*(?:piezas|pieces|paneles|panels|tablillas|cuadros)\b/;
const MULTIPART = /\b(?:diptico|triptico|poliptico|diptic|triptic|diptych|triptych|polyptych|diptychon|triptychon)\b/;

/**
 * Preserve the recorded physical sides, even when the photo has a different
 * aspect ratio. Photo metadata only disambiguates portrait versus landscape.
 * A missing unit is deliberately not interpreted as centimetres.
 */
export function getArtworkMetrics(artwork: ArtworkGeometrySource): ArtworkMetrics {
  const dimensions = artwork.dimensions?.trim()
    ? parsePhysicalDimensions(artwork.dimensions, true)
    : parseDescriptionDimensions(artwork.description, artwork.caption);
  const imageRatio = positive(artwork.width) && positive(artwork.height)
    ? artwork.width / artwork.height
    : null;

  if (!dimensions) {
    return { ratio: imageRatio ?? 1, widthCm: null, heightCm: null, longestCm: null };
  }

  let { width, height } = dimensions;
  // Almost-square image exports do not provide reliable orientation evidence.
  if (imageRatio !== null && ((imageRatio > 1.03 && width < height) || (imageRatio < 1 / 1.03 && width > height))) {
    [width, height] = [height, width];
  }

  return { ratio: width / height, widthCm: width, heightCm: height, longestCm: Math.max(width, height) };
}

/**
 * One physical scale applies to both axes. Known dimensions are never reduced
 * to fit a wall: an oversized placement reports fits=false for scene selection.
 */
export function getArtworkPlacement(metrics: ArtworkMetrics, scene: RoomScene): ArtworkPlacement {
  const aspectRatio = positive(scene.imageAspectRatio) ? scene.imageAspectRatio : 1.5;
  const isEstimated = metrics.widthCm === null || metrics.heightCm === null;
  let width: number;
  let height: number;

  if (!isEstimated) {
    const scale = scene.reference.imageWidthPercent / scene.reference.widthCm;
    width = metrics.widthCm! * scale;
    height = metrics.heightCm! * scale * aspectRatio;
  } else {
    // A composition preview, not an invented real-world measurement.
    const availableWidth = 2 * Math.max(0, Math.min(scene.artworkCenter.x - scene.wall.left, scene.wall.right - scene.artworkCenter.x));
    const availableHeight = 2 * Math.max(0, Math.min(scene.artworkCenter.y - scene.wall.top, scene.wall.bottom - scene.artworkCenter.y));
    const ratio = positive(metrics.ratio) ? metrics.ratio : 1;
    width = Math.min(availableWidth * 0.65, availableHeight * 0.65 * ratio / aspectRatio);
    height = width / ratio * aspectRatio;
  }

  const x = scene.artworkCenter.x;
  const y = scene.artworkCenter.y - height / 2;
  const tolerance = 0.000001;
  const fits = positive(width) && positive(height)
    && x - width / 2 >= scene.wall.left - tolerance
    && x + width / 2 <= scene.wall.right + tolerance
    && y >= scene.wall.top - tolerance
    && y + height <= scene.wall.bottom + tolerance;

  return { x, y, width, height, isEstimated, fits };
}

/** Select fitting rooms; never make an oversized work smaller to offer a room. */
export function getMockupsForArtwork<T extends RoomScene>(artwork: ArtworkGeometrySource, scenes: readonly T[]): T[] {
  const metrics = getArtworkMetrics(artwork);
  const fittingScenes = scenes.filter((scene) => getArtworkPlacement(metrics, scene).fits);

  if (metrics.longestCm === null) {
    const previews = fittingScenes.filter((scene) => scene.sizeRange.min <= 100 && scene.sizeRange.max >= 100);
    return (previews.length > 0 ? previews : fittingScenes).slice(0, 3);
  }

  const longestCm = metrics.longestCm;
  const sizeMatched = fittingScenes.filter((scene) => longestCm >= scene.sizeRange.min && longestCm <= scene.sizeRange.max);
  if (sizeMatched.length >= 2) return sizeMatched;

  // If an unusually tall or wide work does not fit its usual rooms, offer a
  // larger room only when its calibrated wall really has enough space.
  const largerRooms = fittingScenes
    .filter((scene) => longestCm < scene.sizeRange.min)
    .sort((a, b) => a.sizeRange.min - b.sizeRange.min);
  const preferredRooms = [...sizeMatched, ...largerRooms.slice(0, Math.max(2 - sizeMatched.length, 0))];
  if (preferredRooms.length > 0) return preferredRooms;

  // The ranges describe preferred compositions, not hard physical limits. A
  // very wide, low work may still fit a spacious wall beyond the preferred max.
  return fittingScenes.sort((a, b) => physicalWallArea(b) - physicalWallArea(a)).slice(0, 2);
}

function physicalWallArea(scene: RoomScene): number {
  const centimetresPerPercent = scene.reference.widthCm / scene.reference.imageWidthPercent;
  const aspectRatio = positive(scene.imageAspectRatio) ? scene.imageAspectRatio : 1.5;
  return (scene.wall.right - scene.wall.left) * (scene.wall.bottom - scene.wall.top)
    * centimetresPerPercent ** 2 / aspectRatio;
}

function parseDescriptionDimensions(description: string, caption: string): PhysicalDimensions | null {
  const fromDescription = parsePhysicalDimensions(description);
  const fromCaption = parsePhysicalDimensions(caption);
  // Conflicting fallback metadata cannot establish a reliable scale.
  if (fromDescription && fromCaption && !sameSides(fromDescription, fromCaption)) return null;
  return fromDescription ?? fromCaption;
}

function parsePhysicalDimensions(value: string | null, isDimensionField = false): PhysicalDimensions | null {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&times;|&#215;|&#x[dD]7;/g, "×")
    .replace(/&nbsp;|&#160;/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  // Three dimensions cannot establish the flat full-work envelope.
  if (new RegExp(`${NUMBER}\\s*(?:${UNIT})?\\s*[x×]\\s*${NUMBER}\\s*(?:${UNIT})?\\s*[x×]`, "i").test(text)) return null;

  const matches = [...text.matchAll(new RegExp(PAIR, "gi"))];
  if (matches.length !== 1) return null;
  const before = text.slice(0, matches[0].index);
  const after = text.slice(matches[0].index! + matches[0][0].length);
  // Check ranges/fractions beside the measurement, not unrelated life dates
  // in a title or caption (for example "Edgar Allan Poe, 1809–1849").
  if (/\d\s*[-–/]\s*$/.test(before) || /^\s*(?:[-–/]\s*\d|\d+\s*\/)/.test(after)) return null;

  const explicitlyTotal = /\b(?:total(?:es)?|overall|conjunto)\s*:?\s*$/.test(before)
    || /^\s*\(?\s*(?:total(?:es)?|overall|conjunto)\b/.test(after);
  if (!explicitlyTotal && (PER_PANEL.test(text) || (!isDimensionField && MULTIPART.test(text)))) return null;
  // A single pair in the dedicated dimension field describes the whole work,
  // including existing entries such as "200 x 100 cm (díptico)". Explicit
  // per-panel/count wording remains ambiguous even in that field.
  const [, first, firstUnit, second, secondUnit] = matches[0];
  if (!firstUnit && !secondUnit) return null;

  const width = Number(first.replace(",", ".")) * unitToCentimetres(firstUnit ?? secondUnit);
  const height = Number(second.replace(",", ".")) * unitToCentimetres(secondUnit ?? firstUnit);
  return positive(width) && positive(height) ? { width, height } : null;
}

function unitToCentimetres(unit: string): number {
  const normalized = unit.replace(/\.$/, "");
  if (normalized === "mm") return 0.1;
  if (normalized === "m") return 100;
  if (normalized === "cm") return 1;
  return 2.54;
}

function sameSides(first: PhysicalDimensions, second: PhysicalDimensions): boolean {
  const tolerance = 0.000001;
  const close = (a: number, b: number) => Math.abs(a - b) < tolerance;
  return (close(first.width, second.width) && close(first.height, second.height))
    || (close(first.width, second.height) && close(first.height, second.width));
}

function positive(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
}
