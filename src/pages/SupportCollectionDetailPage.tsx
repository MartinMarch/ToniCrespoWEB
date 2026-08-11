import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { useAdminSession } from "../app/adminSession";
import { useEditableContent, useEditingContent, useSupportCollection } from "../app/editableContent";
import { useSitePreferences } from "../app/sitePreferences";
import { ArtworkShowcaseList } from "../components/artworks/ArtworkShowcaseList";
import { ArtworkEditorDialog } from "../components/admin/ContentEditorDialogs";
import { ConfirmDialog } from "../components/admin/AdminUi";
import { BreadcrumbTrail } from "../components/navigation/BreadcrumbTrail";
import { PageLoader } from "../components/ui/Loaders";
import type { SupportKind } from "../types/support";
import { deleteArtwork, getEditableOperationErrorMessage } from "../services/editableContentService";
import type { CurrentArtwork } from "../types/currentSite";

type SupportCollectionDetailPageProps = {
  kind: SupportKind;
};

const supportBackLinks = {
  canvas: {
    path: "/lienzos",
  },
  paper: {
    path: "/laminas",
  },
} satisfies Record<SupportKind, { path: string }>;

export function SupportCollectionDetailPage({ kind }: SupportCollectionDetailPageProps) {
  const { labels } = useSitePreferences();
  const { isEditMode } = useAdminSession();
  const { isLoading, refreshContent } = useEditableContent();
  const editableCollections = useEditingContent().collections;
  const { collectionSlug } = useParams();
  const collection = useSupportCollection(kind, collectionSlug);
  const backLink = supportBackLinks[kind];
  const supportLabel = labels.support[kind];
  const [isArtworkEditorOpen, setIsArtworkEditorOpen] = useState(false);
  const [artworkToEditId, setArtworkToEditId] = useState<string | null>(null);
  const [artworkToDelete, setArtworkToDelete] = useState<CurrentArtwork | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <section className="page-section support-detail-page">
        <PageLoader variant="grid" />
      </section>
    );
  }

  if (!collection) {
    return (
      <section className="page-section narrow">
        <h1>{labels.status.collectionNotFound}</h1>
        <Link to={backLink.path}>
          {labels.actions.backToSupportCollections} {supportLabel}
        </Link>
      </section>
    );
  }

  const currentCollection = collection;
  const editableCollection = editableCollections.find((candidate) => candidate.id === currentCollection.id) ?? null;
  const artworkToEdit = artworkToEditId ? editableCollection?.artworks.find((artwork) => artwork.id === artworkToEditId) ?? null : null;
  const canEditCollection = isEditMode && Boolean(editableCollection);

  async function handleDeleteArtwork() {
    if (!artworkToDelete) return;

    setOperationError(null);
    setIsDeleting(true);
    try {
      await deleteArtwork({
        id: artworkToDelete.id,
        imageUrl: artworkToDelete.imageUrl,
      });
      await refreshContent();
      setArtworkToDelete(null);
    } catch (error) {
      setOperationError(getEditableOperationErrorMessage(error, "No se pudo eliminar la obra."));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <section className={`page-section support-detail-page${isEditMode ? " is-editing" : ""}`}>
        <div className="support-detail-heading">
          <BreadcrumbTrail
            items={[
              { label: labels.nav.work, path: "/obra" },
              { label: supportLabel, path: backLink.path },
              { label: currentCollection.title },
            ]}
          />
          <h1>{currentCollection.title}</h1>
        </div>
        {operationError ? <p className="editor-operation-feedback" role="alert">{operationError}</p> : null}
        <ArtworkShowcaseList
          artworks={currentCollection.artworks}
          isEditing={canEditCollection}
          onAdd={() => setIsArtworkEditorOpen(true)}
          onEdit={(artwork) => setArtworkToEditId(artwork.id)}
          onDelete={setArtworkToDelete}
          supportKind={kind}
        />
      </section>

      {isArtworkEditorOpen ? (
        <ArtworkEditorDialog
          collectionId={currentCollection.id}
          collectionTitle={currentCollection.title}
          onClose={() => setIsArtworkEditorOpen(false)}
          onSaved={refreshContent}
        />
      ) : null}

      {artworkToEdit ? (
        <ArtworkEditorDialog
          artwork={artworkToEdit}
          collectionId={currentCollection.id}
          collectionTitle={currentCollection.title}
          onClose={() => setArtworkToEditId(null)}
          onSaved={refreshContent}
        />
      ) : null}

      {artworkToDelete ? (
        <ConfirmDialog
          title="Eliminar obra"
          description={`Se eliminará “${artworkToDelete.title}” de esta colección.`}
          isPending={isDeleting}
          onCancel={() => setArtworkToDelete(null)}
          onConfirm={() => void handleDeleteArtwork()}
        />
      ) : null}
    </>
  );
}
