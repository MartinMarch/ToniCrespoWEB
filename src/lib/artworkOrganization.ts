import type { EditableCollection } from "../services/editableContentService";

/** Includes every artwork, including hidden works and empty collections. */
export type OrganizationState = Record<string, string[]>;

export type OrganizationChange = {
  artworkId: string;
  fromCollectionId: string;
  toCollectionId: string;
  fromIndex: number;
  toIndex: number;
};

export type OrganizationPayload = {
  expected_state: Array<{ id: string; artworks: Array<{ id: string; sort_order: number }> }>;
  next_state: Array<{ id: string; artwork_ids: string[] }>;
};

export function chooseOrganizationPanels(collectionIds: string[], previous: { left: string; right: string }) {
  const left = collectionIds.includes(previous.left) ? previous.left : collectionIds[0] ?? "";
  const right = previous.right !== left && collectionIds.includes(previous.right)
    ? previous.right : collectionIds.find((id) => id !== left) ?? "";
  return { left, right };
}

export function getOrganizerReturnPath(candidate: unknown): string {
  return typeof candidate === "string" && candidate.startsWith("/") && !candidate.startsWith("//")
    && !candidate.startsWith("/admin/") && !/[\\\u0000-\u001f\u007f]/.test(candidate) ? candidate : "/";
}

export function createOrganizationState(collections: EditableCollection[]): OrganizationState {
  return Object.fromEntries(collections.map((collection) => [
    collection.id,
    [...collection.artworks].sort((a, b) => a.sortOrder - b.sortOrder).map((artwork) => artwork.id),
  ]));
}

/** targetIndex is the final zero-based index, after removing the work from its source. */
export function moveArtwork(
  state: OrganizationState,
  artworkId: string,
  targetCollectionId: string,
  targetIndex: number,
): OrganizationState {
  if (!Object.prototype.hasOwnProperty.call(state, targetCollectionId) || !Number.isFinite(targetIndex)) return state;
  const sourceCollectionId = Object.keys(state).find((id) => state[id].includes(artworkId));
  if (sourceCollectionId === undefined) return state;

  const sourceIndex = state[sourceCollectionId].indexOf(artworkId);
  const target = state[targetCollectionId].filter((id) => id !== artworkId);
  const index = Math.max(0, Math.min(target.length, Math.trunc(targetIndex)));
  if (sourceCollectionId === targetCollectionId && sourceIndex === index) return state;
  target.splice(index, 0, artworkId);
  return {
    ...state,
    [sourceCollectionId]: state[sourceCollectionId].filter((id) => id !== artworkId),
    [targetCollectionId]: target,
  };
}

function indexState(state: OrganizationState) {
  const result = new Map<string, { collectionId: string; index: number }>();
  for (const [collectionId, artworks] of Object.entries(state)) {
    if (!Array.isArray(artworks)) throw new Error("La organización contiene una colección no válida.");
    artworks.forEach((artworkId, index) => {
      if (typeof artworkId !== "string" || !artworkId || result.has(artworkId)) {
        throw new Error("La organización contiene obras duplicadas o no válidas.");
      }
      result.set(artworkId, { collectionId, index });
    });
  }
  return result;
}

export function getOrganizationChanges(baseline: OrganizationState, draft: OrganizationState): OrganizationChange[] {
  const before = indexState(baseline);
  const after = indexState(draft);
  if (
    Object.keys(baseline).length !== Object.keys(draft).length ||
    Object.keys(baseline).some((id) => !Object.prototype.hasOwnProperty.call(draft, id)) ||
    before.size !== after.size || [...before.keys()].some((id) => !after.has(id))
  ) {
    throw new Error("La organización debe conservar todas las obras y colecciones. Recarga el catálogo e inténtalo de nuevo.");
  }
  const changes: OrganizationChange[] = [];
  for (const [artworkId, previous] of before) {
    const next = after.get(artworkId)!;
    if (previous.collectionId !== next.collectionId || previous.index !== next.index) {
      changes.push({ artworkId, fromCollectionId: previous.collectionId, toCollectionId: next.collectionId,
        fromIndex: previous.index, toIndex: next.index });
    }
  }
  return changes;
}

/** Send complete snapshots only for affected collections, never a filtered visible subset. */
export function buildOrganizationPayload(collections: EditableCollection[], next: OrganizationState): OrganizationPayload {
  const baseline = createOrganizationState(collections);
  const changes = getOrganizationChanges(baseline, next);
  const collectionById = new Map(collections.map((collection) => [collection.id, collection]));
  if (changes.some((change) => collectionById.get(change.fromCollectionId)?.supportKind !== collectionById.get(change.toCollectionId)?.supportKind)) {
    throw new Error("No se pueden mover obras entre Lienzos y Obra en papel. Elige una colección de la misma sección.");
  }
  const affected = new Set(changes.flatMap((change) => [change.fromCollectionId, change.toCollectionId]));
  const touched = collections.filter((collection) => affected.has(collection.id));
  return {
    expected_state: touched.map((collection) => ({
      id: collection.id,
      artworks: collection.artworks.map((artwork) => ({ id: artwork.id, sort_order: artwork.sortOrder })),
    })),
    next_state: touched.map((collection) => ({ id: collection.id, artwork_ids: [...next[collection.id]] })),
  };
}
