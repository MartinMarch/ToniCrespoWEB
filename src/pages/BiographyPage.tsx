import { useRef, useState } from "react";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useAdminSession } from "../app/adminSession";
import { useBiographyContent, useEditableContent, useEditingContent } from "../app/editableContent";
import { BiographyTextDialog } from "../components/admin/ContentEditorDialogs";
import { ConfirmDialog, EditIconButton } from "../components/admin/AdminUi";
import {
  cleanupOwnedEditableAssets,
  getEditableOperationErrorMessage,
  uploadEditableAssets,
  upsertBiography,
} from "../services/editableContentService";
import { useSitePreferences } from "../app/sitePreferences";
import { LoadingImage, PageLoader } from "../components/ui/Loaders";

export function BiographyPage() {
  const { labels } = useSitePreferences();
  const { isEditMode } = useAdminSession();
  const { isLoading, refreshContent } = useEditableContent();
  const biography = useBiographyContent();
  const editableBiography = useEditingContent().biography;
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);
  const [galleryImageToDelete, setGalleryImageToDelete] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const page = biography.page;

  function getBiographyInput(overrides?: Partial<typeof editableBiography>) {
    const next = { ...editableBiography, ...overrides };
    return {
      html: next.page?.html ?? "",
      mainImageUrl: next.mainImageUrl,
      mainImageAlt: next.mainImageAlt,
      galleryImages: next.galleryImages,
      translations: next.page?.translations,
    };
  }

  async function handleCoverImage(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;

    setOperationError(null);
    setIsUpdating(true);
    let newUrl: string | null = null;
    let saved = false;
    try {
      const [uploadedUrl] = await uploadEditableAssets("biography", [file]);
      if (!uploadedUrl) throw new Error("No se pudo preparar la imagen de portada.");
      newUrl = uploadedUrl;
      await upsertBiography(getBiographyInput({ mainImageUrl: uploadedUrl }));
      saved = true;
      await cleanupOwnedEditableAssets([editableBiography.mainImageUrl]);
      await refreshContent();
    } catch (error) {
      if (!saved && newUrl) await cleanupOwnedEditableAssets([newUrl]);
      setOperationError(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function handleGalleryImages(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setOperationError(null);
    setIsUpdating(true);
    let uploaded: string[] = [];
    let saved = false;
    try {
      uploaded = await uploadEditableAssets("biography", files);
      await upsertBiography(
        getBiographyInput({
          galleryImages: [
            ...editableBiography.galleryImages,
            ...uploaded.map((url, index) => ({
              url,
              alt: getImageLabel(files[index]),
            })),
          ],
        }),
      );
      saved = true;
      await refreshContent();
    } catch (error) {
      if (!saved) await cleanupOwnedEditableAssets(uploaded);
      setOperationError(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  }

  async function handleSaveText(input: { html: string; translations: NonNullable<typeof editableBiography.page>["translations"] }) {
    await upsertBiography({
      ...getBiographyInput(),
      html: input.html,
      translations: input.translations,
    });
    await refreshContent();
  }

  async function handleDeleteGalleryImage() {
    if (!galleryImageToDelete) return;

    setOperationError(null);
    setIsUpdating(true);
    try {
      await upsertBiography(
        getBiographyInput({
          galleryImages: editableBiography.galleryImages.filter((image) => image.url !== galleryImageToDelete),
        }),
      );
      await cleanupOwnedEditableAssets([galleryImageToDelete]);
      await refreshContent();
      setGalleryImageToDelete(null);
    } catch (error) {
      setOperationError(getErrorMessage(error));
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <>
      <section className={`page-section biography-page${isEditMode ? " is-editing" : ""}`}>
        <div className="biography-heading">
          <h1>{labels.nav.biography}</h1>
        </div>
        {operationError ? <p className="editor-operation-feedback" role="alert">{operationError}</p> : null}

        {isLoading ? (
          <PageLoader variant="biography" />
        ) : (
          <>
            <figure className="biography-portrait biography-portrait--main editor-media-target">
              <LoadingImage src={biography.mainImageUrl} alt={biography.mainImageAlt} loading="eager" />
              {isEditMode ? (
                <>
                  <input
                    ref={coverInputRef}
                    className="editor-visually-hidden"
                    type="file"
                    accept="image/*"
                    onChange={(event) => void handleCoverImage(event.target.files)}
                  />
                  <EditIconButton
                    className="editor-media-target__action"
                    label="Cambiar imagen de portada"
                    disabled={isUpdating}
                    onClick={() => coverInputRef.current?.click()}
                  >
                    <Pencil aria-hidden="true" />
                  </EditIconButton>
                </>
              ) : null}
            </figure>

            <div className="editor-text-target">
              <div className="biography-content wp-content" dangerouslySetInnerHTML={{ __html: page?.html ?? "" }} />
              {isEditMode ? (
                <EditIconButton
                  className="editor-text-target__action"
                  label="Editar texto de trayectoria"
                  disabled={isUpdating}
                  onClick={() => setIsTextEditorOpen(true)}
                >
                  <Pencil aria-hidden="true" />
                </EditIconButton>
              ) : null}
            </div>

            <div className="biography-portraits" aria-label={labels.aria.authorPhotos}>
              {biography.galleryImages.map((image, index) => (
                <figure
                  key={image.url}
                  className={`biography-portrait editor-media-target ${
                    index % 2 === 0 ? "biography-portrait--horizontal" : "biography-portrait--vertical"
                  }`}
                >
                  <LoadingImage src={image.url} alt={image.alt} loading="eager" />
                  {isEditMode ? (
                    <EditIconButton
                      className="editor-media-target__action editor-media-target__action--danger"
                      label="Eliminar imagen"
                      tone="danger"
                      disabled={isUpdating}
                      onClick={() => setGalleryImageToDelete(image.url)}
                    >
                      <Trash2 aria-hidden="true" />
                    </EditIconButton>
                  ) : null}
                </figure>
              ))}
              {isEditMode ? (
                <button
                  type="button"
                  className="biography-portrait biography-portrait--add editor-add-card"
                  disabled={isUpdating}
                  onClick={() => galleryInputRef.current?.click()}
                  aria-label="Añadir imágenes de trayectoria"
                  title="Añadir imágenes de trayectoria"
                >
                  <ImagePlus aria-hidden="true" />
                </button>
              ) : null}
              {isEditMode ? (
                <input
                  ref={galleryInputRef}
                  className="editor-visually-hidden"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => void handleGalleryImages(event.target.files)}
                />
              ) : null}
            </div>
          </>
        )}
      </section>

      {isTextEditorOpen && editableBiography.page ? (
        <BiographyTextDialog
          html={editableBiography.page.html}
          translations={editableBiography.page.translations}
          onClose={() => setIsTextEditorOpen(false)}
          onSave={handleSaveText}
        />
      ) : null}

      {galleryImageToDelete ? (
        <ConfirmDialog
          title="Eliminar imagen"
          description="Esta imagen dejará de aparecer en Trayectoria."
          isPending={isUpdating}
          onCancel={() => setGalleryImageToDelete(null)}
          onConfirm={() => void handleDeleteGalleryImage()}
        />
      ) : null}
    </>
  );
}

function getImageLabel(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Fotografía de Toni Crespo";
}

function getErrorMessage(error: unknown) {
  return getEditableOperationErrorMessage(error);
}
