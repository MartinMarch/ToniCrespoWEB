export type CollectionDescriptionAlignment = "justify" | "center";

/** Legacy or malformed stored values keep the site's justified presentation. */
export function normalizeCollectionDescriptionAlignment(value: unknown): CollectionDescriptionAlignment {
  return value === "center" ? "center" : "justify";
}
