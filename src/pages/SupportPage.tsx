import { Link } from "react-router-dom";
import { useState, type CSSProperties } from "react";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useAdminSession } from "../app/adminSession";
import { useEditableContent, useEditingContent, useSupportCollections } from "../app/editableContent";
import { useSitePreferences } from "../app/sitePreferences";
import { CollectionEditorDialog } from "../components/admin/ContentEditorDialogs";
import { ConfirmDialog, EditIconButton } from "../components/admin/AdminUi";
import { BreadcrumbTrail } from "../components/navigation/BreadcrumbTrail";
import { LoadingImage, PageLoader } from "../components/ui/Loaders";
import {
  deleteCollection,
  getEditableOperationErrorMessage,
  type EditableCollection,
} from "../services/editableContentService";
import {
  getSupportCollectionPath,
  type SupportKind,
} from "../types/support";

type SupportPageProps = {
  kind: SupportKind;
};

export function SupportPage({ kind }: SupportPageProps) {
  const { labels } = useSitePreferences();
  const { isEditMode } = useAdminSession();
  const { isLoading, refreshContent } = useEditableContent();
  const editableCollections = useEditingContent().collections;
  const groups = useSupportCollections(kind);
  const title = labels.support[kind];
  const [isCollectionEditorOpen, setIsCollectionEditorOpen] = useState(false);
  const [collectionToEditId, setCollectionToEditId] = useState<string | null>(null);
  const [collectionToDeleteId, setCollectionToDeleteId] = useState<string | null>(null);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const collectionToEdit = collectionToEditId ? editableCollections.find((collection) => collection.id === collectionToEditId) ?? null : null;
  const collectionToDelete = collectionToDeleteId
    ? editableCollections.find((collection) => collection.id === collectionToDeleteId) ?? null
    : null;

  async function handleDeleteCollection() {
    if (!collectionToDelete) return;

    setOperationError(null);
    setIsDeletingCollection(true);
    try {
      await deleteCollection({ id: collectionToDelete.id });
      await refreshContent();
      setCollectionToDeleteId(null);
    } catch (error) {
      setOperationError(getEditableOperationErrorMessage(error, "No se pudo eliminar la colección."));
    } finally {
      setIsDeletingCollection(false);
    }
  }

  return (
    <>
      <section className={`page-section support-page support-page--index${isEditMode ? " is-editing" : ""}`}>
        <div className="support-page__heading">
          <BreadcrumbTrail items={[{ label: labels.nav.work, path: "/obra" }, { label: title }]} />
          <h1>{title}</h1>
        </div>
        {operationError ? <p className="editor-operation-feedback" role="alert">{operationError}</p> : null}

        {isLoading ? (
          <PageLoader variant="grid" />
        ) : (
          <div className="support-collection-preview-grid">
            {isEditMode ? (
              <button
                type="button"
                className="support-collection-preview-card support-collection-preview-card--add"
                onClick={() => setIsCollectionEditorOpen(true)}
                aria-label={`Crear colección de ${title}`}
                title={`Crear colección de ${title}`}
              >
                <span className="support-collection-preview-card__image editor-add-card">
                  <FolderPlus aria-hidden="true" />
                </span>
              </button>
            ) : null}
            {groups.map((group) => (
              <CollectionPreviewLink
                key={group.id}
                kind={kind}
                group={group}
                isEditing={isEditMode}
                emptyCollectionLabel={labels.status.emptyCollection}
                artworkSingularLabel={labels.status.artworkSingular}
                artworkPluralLabel={labels.status.artworkPlural}
                onEdit={() => setCollectionToEditId(group.id)}
                onDelete={() => setCollectionToDeleteId(group.id)}
              />
            ))}
          </div>
        )}
      </section>

      {isCollectionEditorOpen ? (
        <CollectionEditorDialog
          supportKind={kind}
          onClose={() => setIsCollectionEditorOpen(false)}
          onSaved={refreshContent}
        />
      ) : null}

      {collectionToEdit ? (
        <CollectionEditorDialog
          collection={collectionToEdit}
          supportKind={kind}
          onClose={() => setCollectionToEditId(null)}
          onSaved={refreshContent}
        />
      ) : null}

      {collectionToDelete ? (
        <ConfirmDialog
          title="Eliminar colección"
          description={getCollectionDeleteDescription(collectionToDelete)}
          isPending={isDeletingCollection}
          onCancel={() => setCollectionToDeleteId(null)}
          onConfirm={() => void handleDeleteCollection()}
        />
      ) : null}
    </>
  );
}

function CollectionPreviewLink({
  group,
  isEditing,
  kind,
  emptyCollectionLabel,
  artworkSingularLabel,
  artworkPluralLabel,
  onEdit,
  onDelete,
}: {
  group: EditableCollection;
  isEditing: boolean;
  kind: SupportKind;
  emptyCollectionLabel: string;
  artworkSingularLabel: string;
  artworkPluralLabel: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const previewArtworks = getCollectionPreviewArtworks(group.artworks);
  const artworkCountLabel = group.artworks.length === 1 ? artworkSingularLabel : artworkPluralLabel;
  const [isTouching, setIsTouching] = useState(false);

  return (
    <article className="support-collection-preview-card editor-media-target">
      <Link
        aria-label={
          group.artworks.length > 0
            ? `${group.title}, ${group.artworks.length} ${artworkCountLabel}`
            : `${group.title}, ${emptyCollectionLabel}`
        }
        className={`support-collection-preview-card__link${isTouching ? " is-touching" : ""}`}
        onPointerCancel={() => setIsTouching(false)}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") setIsTouching(true);
        }}
        onPointerLeave={() => setIsTouching(false)}
        onPointerUp={() => setIsTouching(false)}
        to={getSupportCollectionPath(kind, group.slug)}
      >
        <span className="support-collection-preview-card__image">
          {previewArtworks.length > 0 ? (
            <span className="support-collection-preview-card__stack" aria-hidden="true">
              {previewArtworks.map((artwork, index) => (
                <span
                  className="support-collection-preview-card__artwork"
                  key={artwork.id}
                  style={getCollectionArtworkStyle(artwork, index)}
                >
                  <LoadingImage
                    src={artwork.thumbnailUrl ?? artwork.imageUrl}
                    alt=""
                    draggable={false}
                    loading="lazy"
                  />
                </span>
              ))}
            </span>
          ) : (
            <span className="support-collection-preview-card__empty" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 5h14v14H5z" />
                <path d="m8 15 2.7-3 2.1 2.2 1.5-1.6L17 15" />
                <circle cx="9" cy="9" r="1" />
              </svg>
              <span>{emptyCollectionLabel}</span>
            </span>
          )}
        </span>
        <span className="support-collection-preview-card__details">
          <span className="support-collection-preview-card__title">{group.title}</span>
          {group.artworks.length > 0 ? (
            <span className="support-collection-preview-card__count">
              {group.artworks.length} {artworkCountLabel}
            </span>
          ) : null}
        </span>
      </Link>
      {isEditing ? (
        <>
          <EditIconButton
            className="editor-media-target__action editor-media-target__action--edit"
            label={`Editar colección: ${group.title}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
          </EditIconButton>
          <EditIconButton
            className="editor-media-target__action editor-media-target__action--danger"
            label={`Eliminar colección: ${group.title}`}
            tone="danger"
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
          </EditIconButton>
        </>
      ) : null}
    </article>
  );
}

const collectionStackPositions = [
  { x: 0, y: 0, rotation: 0, fanX: 0, fanY: -1, fanRotation: 0, mobileX: 0, mobileY: 0 },
  { x: -3, y: 1, rotation: -2.2, fanX: -7, fanY: 1, fanRotation: -3.6, mobileX: -6, mobileY: 1 },
  { x: 3, y: 1, rotation: 2.2, fanX: 7, fanY: 1, fanRotation: 3.6, mobileX: 6, mobileY: 1 },
] as const;

function getCollectionPreviewArtworks(artworks: EditableCollection["artworks"]) {
  const previewLimit = collectionStackPositions.length;
  if (artworks.length <= previewLimit) return artworks;

  return Array.from({ length: previewLimit }, (_, index) => {
    const artworkIndex = Math.round((index * (artworks.length - 1)) / (previewLimit - 1));
    return artworks[artworkIndex];
  });
}

function getCollectionArtworkStyle(artwork: EditableCollection["artworks"][number], index: number): CSSProperties {
  const position = collectionStackPositions[index] ?? collectionStackPositions[0];
  const hasDimensions = Boolean(artwork.width && artwork.height && artwork.width > 0 && artwork.height > 0);
  const ratio = hasDimensions ? artwork.width! / artwork.height! : 1;
  const artworkWidth = ratio >= 1.75 ? 74 : ratio >= 1.15 ? 70 : ratio <= 0.8 ? 46 : ratio < 0.96 ? 52 : 60;
  const aspectRatio = hasDimensions ? `${artwork.width} / ${artwork.height}` : "1 / 1";

  return {
    "--collection-artwork-ratio": aspectRatio,
    "--collection-artwork-width": `${artworkWidth}%`,
    "--collection-stack-x": `${position.x}%`,
    "--collection-stack-y": `${position.y}%`,
    "--collection-stack-rotation": `${position.rotation}deg`,
    "--collection-stack-fan-x": `${position.fanX}%`,
    "--collection-stack-fan-y": `${position.fanY}%`,
    "--collection-stack-fan-rotation": `${position.fanRotation}deg`,
    "--collection-stack-mobile-x": `${position.mobileX}%`,
    "--collection-stack-mobile-y": `${position.mobileY}%`,
    "--collection-stack-z": collectionStackPositions.length - index,
  } as CSSProperties;
}

function getCollectionDeleteDescription(collection: EditableCollection) {
  const artworkCount = collection.artworks.length;

  if (artworkCount === 0) {
    return `Se eliminará “${collection.title}”. La colección no contiene obras.`;
  }

  return `Se eliminará “${collection.title}” y ${artworkCount} ${artworkCount === 1 ? "obra" : "obras"} de forma permanente.`;
}
