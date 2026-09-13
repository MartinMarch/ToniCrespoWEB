import type { EditableCollection } from "../services/editableContentService";
import type { SupportKind } from "../types/support";

/** Permanent recent collections take precedence even over older negative positions. */
export function compareSupportCollections(a: EditableCollection, b: EditableCollection): number {
  return Number(b.isRecent === true) - Number(a.isRecent === true) || a.sortOrder - b.sortOrder;
}

/**
 * The stored support branch and publication state are the source of truth.
 * Imported collections, empty collections and incomplete works remain visible;
 * editorial text or its translation must never decide catalog membership.
 * Call AFTER removing unpublished artworks for public views.
 */
export function selectSupportCollections(collections: EditableCollection[], kind: SupportKind): EditableCollection[] {
  return collections
    .filter((collection) => collection.supportKind === kind && collection.isPublished)
    .sort(compareSupportCollections);
}

/** Public preview for the organizer; does not change source flags or membership. */
export function selectPublicSupportCollections(collections: EditableCollection[], kind: SupportKind): EditableCollection[] {
  return selectSupportCollections(collections.filter((collection) => collection.isPublished).map((collection) => {
    const artworks = collection.artworks.filter((artwork) => artwork.isPublished);
    return { ...collection, artworks, coverImageUrl: artworks[0]?.imageUrl ?? null };
  }), kind);
}
