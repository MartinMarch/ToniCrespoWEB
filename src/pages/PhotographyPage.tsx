import { useRef, useState } from "react";
import { useAdminSession } from "../app/adminSession";
import { useEditableContent, useEditablePhotoItems, useEditingContent } from "../app/editableContent";
import { ConfirmDialog } from "../components/admin/AdminUi";
import { PhotographyEditorDialog } from "../components/admin/ContentEditorDialogs";
import { PhotographyGallery } from "../components/photography/PhotographyGallery";
import { PageLoader } from "../components/ui/Loaders";
import {
  cleanupOwnedEditableAssets,
  createPhotographyItem,
  deletePhotographyItem,
  getEditableOperationErrorMessage,
  getImageDimensions,
  uploadEditableAssets,
} from "../services/editableContentService";
import { useSitePreferences } from "../app/sitePreferences";

export function PhotographyPage() {
  const { labels } = useSitePreferences();
  const { isEditMode } = useAdminSession();
  const { isLoading, refreshContent } = useEditableContent();
  const photoItems = useEditablePhotoItems();
  const editablePhotoItems = useEditingContent().photoItems;
  const [photoToEditId, setPhotoToEditId] = useState<string | null>(null);
  const [photoToDeleteId, setPhotoToDeleteId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const photoToDelete = photoToDeleteId ? photoItems.find((photo) => photo.id === photoToDeleteId) ?? null : null;
  const photoToEdit = photoToEditId ? editablePhotoItems.find((photo) => photo.id === photoToEditId) ?? null : null;

  async function handleUpload(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setOperationError(null);
    setIsUpdating(true);
    let uploadedUrls: string[] = [];
    const createdUrls = new Set<string>();

    try {
      const imageDimensions = await Promise.all(files.map(getImageDimensions));
      uploadedUrls = await uploadEditableAssets("photography", files);

      for (const [index, imageUrl] of uploadedUrls.entries()) {
        const title = getPhotoTitle(files[index]);
        await createPhotographyItem({
          title,
          imageUrl,
          imageAlt: title,
          width: imageDimensions[index].width,
          height: imageDimensions[index].height,
        });
        createdUrls.add(imageUrl);
      }

      await refreshContent();
    } catch (error) {
      await cleanupOwnedEditableAssets(uploadedUrls.filter((url) => !createdUrls.has(url)));
      setOperationError(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  async function handleDelete() {
    const photo = editablePhotoItems.find((item) => item.id === photoToDeleteId);
    if (!photo) return;

    setOperationError(null);
    setIsUpdating(true);
    try {
      await deletePhotographyItem({ id: photo.id, imageUrl: photo.imageUrl });
      await refreshContent();
      setPhotoToDeleteId(null);
    } catch (error) {
      setOperationError(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <>
      <section className={`page-section photography-page${isEditMode ? " is-editing" : ""}`}>
        <div className="section-heading photography-heading">
          <h1>{labels.nav.photography}</h1>
        </div>
        {operationError ? <p className="editor-operation-feedback" role="alert">{operationError}</p> : null}
        {isEditMode ? (
          <input
            ref={uploadInputRef}
            className="editor-visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => void handleUpload(event.target.files)}
          />
        ) : null}
        {isLoading ? (
          <PageLoader variant="grid" />
        ) : (
          <PhotographyGallery
            photos={photoItems}
            isEditing={isEditMode}
            isAdding={isUpdating}
            onAdd={() => uploadInputRef.current?.click()}
            onEdit={(photo) => setPhotoToEditId(photo.id)}
            onDelete={(photo) => setPhotoToDeleteId(photo.id)}
          />
        )}
      </section>

      {photoToEdit ? (
        <PhotographyEditorDialog
          photo={photoToEdit}
          onClose={() => setPhotoToEditId(null)}
          onSaved={refreshContent}
        />
      ) : null}

      {photoToDelete ? (
        <ConfirmDialog
          title="Eliminar fotografía"
          description="Esta fotografía dejará de aparecer en la galería."
          isPending={isUpdating}
          onCancel={() => setPhotoToDeleteId(null)}
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </>
  );
}

function getPhotoTitle(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Fotografía";
}

function getErrorMessage(error: unknown) {
  return getEditableOperationErrorMessage(error);
}
