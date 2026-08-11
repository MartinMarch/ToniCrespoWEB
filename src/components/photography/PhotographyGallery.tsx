import { useEffect, useState } from "react";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useSitePreferences } from "../../app/sitePreferences";
import { EditIconButton } from "../admin/AdminUi";
import { LoadingImage } from "../ui/Loaders";
import type { CurrentArtwork } from "../../types/currentSite";

type PhotographyGalleryProps = {
  photos: CurrentArtwork[];
  isEditing?: boolean;
  isAdding?: boolean;
  onAdd?: () => void;
  onDelete?: (photo: CurrentArtwork) => void;
  onEdit?: (photo: CurrentArtwork) => void;
};

export function PhotographyGallery({ isAdding = false, isEditing = false, onAdd, onDelete, onEdit, photos }: PhotographyGalleryProps) {
  const { labels } = useSitePreferences();
  const [activePhoto, setActivePhoto] = useState<CurrentArtwork | null>(null);

  useEffect(() => {
    if (!activePhoto) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActivePhoto(null);
      }
    }

    document.documentElement.classList.add("is-lightbox-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.classList.remove("is-lightbox-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePhoto]);

  if (photos.length === 0 && (!isEditing || !onAdd)) {
    return <p className="empty-state">{labels.status.noImages}</p>;
  }

  return (
    <>
      <div className="photography-gallery">
        {isEditing && onAdd ? (
          <button
            type="button"
            className="photography-gallery__add editor-add-card"
            disabled={isAdding}
            onClick={onAdd}
            aria-label="Añadir fotografías"
            title="Añadir fotografías"
          >
            <ImagePlus aria-hidden="true" />
          </button>
        ) : null}
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="photography-gallery__item editor-media-target"
          >
            <button
              type="button"
              className="photography-gallery__open"
              onClick={() => setActivePhoto(photo)}
              aria-label={`${labels.actions.viewFullscreen}: ${photo.title}`}
            >
              <LoadingImage src={photo.imageUrl} alt={photo.imageAlt ?? photo.title} loading="lazy" />
            </button>
            {isEditing && (onEdit || onDelete) ? (
              <>
                {onEdit ? (
                  <EditIconButton
                    className="editor-media-target__action editor-media-target__action--edit"
                    label={`Editar fotografía: ${photo.title}`}
                    onClick={() => onEdit(photo)}
                  >
                    <Pencil aria-hidden="true" />
                  </EditIconButton>
                ) : null}
                {onDelete ? (
                  <EditIconButton
                    className="editor-media-target__action editor-media-target__action--danger"
                    label={`Eliminar fotografía: ${photo.title}`}
                    tone="danger"
                    onClick={() => onDelete(photo)}
                  >
                    <Trash2 aria-hidden="true" />
                  </EditIconButton>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>

      {activePhoto ? (
        <div className="photo-lightbox" role="dialog" aria-modal="true" onClick={() => setActivePhoto(null)}>
          <button type="button" className="photo-lightbox__close" aria-label={labels.actions.closeImage} />
          <LoadingImage src={activePhoto.imageUrl} alt={activePhoto.imageAlt ?? activePhoto.title} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}
