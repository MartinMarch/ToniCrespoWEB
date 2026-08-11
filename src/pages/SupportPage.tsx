import { Link } from "react-router-dom";
import { useState } from "react";
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
  onEdit,
  onDelete,
}: {
  group: EditableCollection;
  isEditing: boolean;
  kind: SupportKind;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const coverArtwork = group.artworks[0];
  const coverImageUrl = coverArtwork?.imageUrl ?? group.coverImageUrl;

  return (
    <article className="support-collection-preview-card editor-media-target">
      <Link className="support-collection-preview-card__link" to={getSupportCollectionPath(kind, group.slug)}>
        <span className="support-collection-preview-card__image">
          {coverImageUrl ? (
            <LoadingImage src={coverImageUrl} alt={coverArtwork?.title ?? group.title} loading="lazy" />
          ) : (
            <span className="support-collection-preview-card__empty" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 5h14v14H5z" />
                <path d="m8 15 2.7-3 2.1 2.2 1.5-1.6L17 15" />
                <circle cx="9" cy="9" r="1" />
              </svg>
            </span>
          )}
        </span>
        <span className="support-collection-preview-card__title">{group.title}</span>
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

function getCollectionDeleteDescription(collection: EditableCollection) {
  const artworkCount = collection.artworks.length;

  if (artworkCount === 0) {
    return `Se eliminará “${collection.title}”. La colección no contiene obras.`;
  }

  return `Se eliminará “${collection.title}” y ${artworkCount} ${artworkCount === 1 ? "obra" : "obras"} de forma permanente.`;
}
