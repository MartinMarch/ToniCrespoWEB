import { Eye, EyeOff, ImageOff, Pencil, Pin, Trash2 } from "lucide-react";
import { ArtworkEditorDialog, CollectionEditorDialog } from "./ContentEditorDialogs";
import { OrganizerDialog } from "./OrganizerDialog";
import { ArtworkReviewNotice, CollectionReviewBadge } from "./ContentReviewNotice";
import { getArtworkReviewIssues, getCollectionReviewSummary } from "../../lib/artworkReview";
import {
  deleteArtwork, deleteEmptyCollection, updateArtworkAvailability, updateArtworkVisibility,
  updateCollectionVisibility, type EditableCollection,
} from "../../services/editableContentService";
import type { SupportKind } from "../../types/support";

export type CatalogAction =
  | { kind: "new-collection"; supportKind: SupportKind }
  | { kind: "new-artwork"; collectionId: string }
  | { kind: "manage-artwork" | "edit-artwork" | "delete-artwork"; artworkId: string }
  | { kind: "manage-collection" | "edit-collection" | "delete-collection"; collectionId: string };

export function isCatalogEditor(action: CatalogAction | null) {
  return Boolean(action && ["new-artwork", "edit-artwork", "new-collection", "edit-collection"].includes(action.kind));
}

/** Editorial forms save explicitly; collection browsing and ordering remain separate drafts. */
export function ContentManagerDialogs({ action, collections, busy, active, error, onClose, onAction, onSaved, onPendingChange, onMutate }: {
  action: CatalogAction;
  collections: EditableCollection[];
  busy: boolean;
  active: boolean;
  error: string | null;
  onClose: () => void;
  onAction: (action: CatalogAction) => void;
  onSaved: () => Promise<void>;
  onPendingChange: (pending: boolean) => void;
  onMutate: (operation: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const collection = "collectionId" in action ? collections.find((item) => item.id === action.collectionId)
    : "artworkId" in action ? collections.find((item) => item.artworks.some((artwork) => artwork.id === action.artworkId)) : null;
  const artwork = "artworkId" in action ? collection?.artworks.find((item) => item.id === action.artworkId) : undefined;
  const formProps = { onClose, onSaved, onPendingChange, isActive: active };
  if (action.kind === "new-collection") return <CollectionEditorDialog supportKind={action.supportKind} {...formProps} />;
  if (action.kind === "edit-collection" && collection) return <CollectionEditorDialog collection={collection} supportKind={collection.supportKind} {...formProps} />;
  if ((action.kind === "new-artwork" || action.kind === "edit-artwork") && collection) {
    return <ArtworkEditorDialog artwork={artwork} collectionId={collection.id} collectionTitle={collection.title}
      collectionOptions={collections.filter((item) => item.supportKind === collection.supportKind)} {...formProps} />;
  }
  if (!active || !collection) return null;
  const feedback = error ? <p className="organizer-error" role="alert">{error}</p> : null;
  const collectionReview = getCollectionReviewSummary(collection);
  const artworksToReview = collection.artworks.filter((item) => getArtworkReviewIssues(item).length > 0);

  if (action.kind === "manage-artwork" && artwork) return <OrganizerDialog title="Gestionar obra" busy={busy} onClose={onClose}>
    <div className="content-manager-artwork-summary">
      {artwork.thumbnailUrl || artwork.imageUrl ? <img src={artwork.thumbnailUrl || artwork.imageUrl} alt={artwork.title} /> : <div className="content-manager-missing-image"><ImageOff aria-hidden="true" /><span>Sin imagen</span></div>}
      <div><h3>{artwork.title.trim() || "Sin título"}</h3><p>{collection.title} · {collection.supportKind === "canvas" ? "Lienzos" : "Obra en papel"}</p>
        <p>{[artwork.technique, artwork.dimensions].filter(Boolean).join(" · ")}</p>
        <div className="content-manager-badges"><span>{artwork.isPublished ? "Visible" : "Oculta"}</span><span>{artwork.isAvailable === false ? "No disponible" : "Disponible"}</span></div>
      </div>
    </div>
    <ArtworkReviewNotice artwork={artwork} expanded />
    <p>Ocultar retira la obra de la web. «No disponible» la mantiene visible con una etiqueta, siempre que su colección también sea visible.</p>
    {feedback}
    <div className="content-manager-action-list">
      <button type="button" disabled={busy} onClick={() => onAction({ kind: "edit-artwork", artworkId: artwork.id })}><Pencil aria-hidden="true" /> Editar ficha</button>
      <button type="button" disabled={busy} onClick={() => void onMutate(() => updateArtworkVisibility({ id: artwork.id, isPublished: !artwork.isPublished }), artwork.isPublished ? "Obra oculta al público." : "Obra marcada como visible.")}>
        {artwork.isPublished ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />} {artwork.isPublished ? "Ocultar obra" : "Mostrar obra"}
      </button>
      <button type="button" disabled={busy} onClick={() => void onMutate(() => updateArtworkAvailability({ id: artwork.id, isAvailable: artwork.isAvailable === false }), "Disponibilidad actualizada.")}>
        {artwork.isAvailable === false ? "Marcar como disponible" : "Marcar como no disponible"}
      </button>
      <button type="button" className="content-manager-danger" disabled={busy} onClick={() => onAction({ kind: "delete-artwork", artworkId: artwork.id })}><Trash2 aria-hidden="true" /> Eliminar obra</button>
    </div>
  </OrganizerDialog>;

  if (action.kind === "delete-artwork" && artwork) return <OrganizerDialog title="Eliminar obra" busy={busy} onClose={onClose}>
    <p>Se eliminará la ficha de «{artwork.title}» de «{collection.title}». Esta acción no se puede deshacer desde el gestor. El archivo de imagen se conserva en el almacenamiento para no afectar a otras obras que lo compartan. Puedes ocultar la obra si quieres conservar también su ficha.</p>
    {feedback}
    <div className="organizer-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="content-manager-danger" disabled={busy} onClick={() => void onMutate(() => deleteArtwork({ id: artwork.id, imageUrl: artwork.imageUrl, preserveAssets: true }), "Obra eliminada del catálogo. Su archivo de imagen se ha conservado.")}>Eliminar definitivamente</button></div>
  </OrganizerDialog>;

  if (action.kind === "manage-collection") return <OrganizerDialog title="Gestionar colección" busy={busy} onClose={onClose}>
    <h3>{collection.title}</h3><p>{collection.supportKind === "canvas" ? "Lienzos" : "Obra en papel"} · {collection.artworks.length} obras · {collection.isPublished ? "Visible" : "Oculta"}</p>
    {collectionReview.artworkCount > 0 ? <section className="content-review-notice" aria-label="Obras de la colección por revisar">
      <CollectionReviewBadge count={collectionReview.artworkCount} />
      <p>Revisa las fichas señaladas; estos avisos no cambian su visibilidad.</p>
      <ul className="content-review-artworks">{artworksToReview.map((item) => <li key={item.id}>
        <button type="button" disabled={busy} aria-label={`Editar ficha: ${item.title.trim() || "Sin título"}`} onClick={() => onAction({ kind: "edit-artwork", artworkId: item.id })}>
          <strong>{item.title.trim() || "Sin título"}</strong>
          <span>{getArtworkReviewIssues(item).map((issue) => issue.message).join(" · ")}</span>
          <span className="content-review-edit-label"><Pencil aria-hidden="true" />Editar ficha</span>
        </button>
      </li>)}</ul>
    </section> : null}
    {collection.isRecent ? <p className="organizer-notice"><Pin aria-hidden="true" /> «Obras recientes» es el espacio permanente para las nuevas obras. Siempre va primero en esta rama; puedes ocultarlo, pero no borrarlo ni cambiarle el nombre.</p> : null}
    {feedback}
    <div className="content-manager-action-list">
      <button type="button" disabled={busy} onClick={() => onAction({ kind: "edit-collection", collectionId: collection.id })}><Pencil aria-hidden="true" /> {collection.isRecent ? "Editar descripción" : "Editar colección"}</button>
      <button type="button" disabled={busy} onClick={() => void onMutate(() => updateCollectionVisibility({ id: collection.id, isPublished: !collection.isPublished }), collection.isPublished ? "Colección oculta al público. Sus obras se conservan." : "Colección marcada como visible.")}>
        {collection.isPublished ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />} {collection.isPublished ? "Ocultar colección" : "Mostrar colección"}
      </button>
      {!collection.isRecent ? <button type="button" className="content-manager-danger" disabled={busy || collection.artworks.length > 0} onClick={() => onAction({ kind: "delete-collection", collectionId: collection.id })}><Trash2 aria-hidden="true" /> Eliminar colección vacía</button> : null}
    </div>
    {!collection.isRecent && collection.artworks.length > 0 ? <p>Para eliminar esta colección, mueve antes sus obras a otra colección de la misma rama. También puedes ocultarla sin perder contenido.</p> : null}
  </OrganizerDialog>;

  if (action.kind === "delete-collection" && !collection.isRecent) return <OrganizerDialog title="Eliminar colección vacía" busy={busy} onClose={onClose}>
    <p>Se eliminará «{collection.title}». Si alguien ha añadido una obra mientras tanto, se cancelará la eliminación para conservarla.</p>{feedback}
    <div className="organizer-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="content-manager-danger" disabled={busy || collection.artworks.length > 0}
      onClick={() => void onMutate(() => deleteEmptyCollection({ id: collection.id }), "Colección vacía eliminada.")}>Eliminar colección</button></div>
  </OrganizerDialog>;
  return null;
}
