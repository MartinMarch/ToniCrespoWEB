import type { CollectionDescriptionAlignment } from "../../types/collectionPresentation";

/** Collection descriptions are editorial plain text, never executable HTML. */
export function CollectionDescription({ description, alignment, compact = false }: {
  description?: string | null;
  alignment?: CollectionDescriptionAlignment;
  compact?: boolean;
}) {
  const paragraphs = (description ?? "").replace(/\r\n?/g, "\n").trim().split(/\n[\t ]*\n+/).filter((paragraph) => paragraph.trim());
  if (!paragraphs.length) return null;

  return (
    <div className={`collection-description${alignment === "center" ? " collection-description--center" : ""}${compact ? " collection-description--compact" : ""}`}>
      {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
    </div>
  );
}
