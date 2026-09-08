import type { CurrentArtwork } from "../types/currentSite";

type ArtworkEditorialSource = Pick<CurrentArtwork, "title" | "technique" | "dimensions" | "caption" | "description">;

/** Derive visible plain text without changing source fields or translations. */
export function getArtworkEditorialText(artwork: ArtworkEditorialSource): { caption: string | null; description: string | null } {
  const metadata = [artwork.title, artwork.technique, artwork.dimensions]
    .map(comparisonText)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  function isMetadataOnly(value: string): boolean {
    let remaining = comparisonText(value);
    if (!remaining) return !value.trim();
    while (remaining) {
      const prefix = metadata.find((item) => remaining === item || remaining.startsWith(`${item} `));
      if (!prefix) return false;
      remaining = remaining.slice(prefix.length).trim();
    }
    return true;
  }

  // Old imports sometimes repeat title/technique/dimensions as standalone
  // description lines. Only discard complete metadata-only lines, never parts
  // of a sentence, and keep the remaining paragraph breaks as entered.
  const description = normalizeLineBreaks(artwork.description)
    .split("\n")
    .filter((line) => !line.trim() || !isMetadataOnly(line))
    .join("\n")
    .trim();
  const caption = normalizeLineBreaks(artwork.caption).trim();
  const descriptionComparison = ` ${comparisonText(description)} `;
  const captionComparison = comparisonText(caption);
  const redundantCaption = isMetadataOnly(caption)
    || descriptionComparison.includes(` ${captionComparison} `);

  return { caption: caption && !redundantCaption ? caption : null, description: description || null };
}

function normalizeLineBreaks(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

function comparisonText(value: string | null): string {
  return (value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
