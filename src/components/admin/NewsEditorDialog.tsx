import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ImageOff, ImagePlus, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useSitePreferences } from "../../app/sitePreferences";
import { getNewsExternalUrl } from "../../lib/newsPresentation";
import { createNewsItem, getEditableOperationErrorMessage, getImageDimensions, updateNewsItem, uploadEditableAsset } from "../../services/editableContentService";
import type { NewsImage, NewsItem } from "../../types/domain";
import type { LocalizedFields, NewsTranslations } from "../../types/localization";
import { AdminDialog, FormMessage } from "./AdminUi";
import { createLocaleValues, toStoredTranslations, TranslationTabs, type EditorLocale, type LocaleValues } from "./LocalizedFields";
import "../../styles/news-editor.css";

type NewsEditorDialogProps = {
  newsItem?: NewsItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type NewsFields = { title: string; dateText: string; location: string; description: string; imageAlt: string };
type GalleryEntry = { id: string; previewUrl: string; previewError?: boolean } & (
  | { kind: "existing"; image: NewsImage }
  | { kind: "file"; file: File }
);
type SaveState = "editing" | "saved" | "uncertain";

const newsCategories: Array<{ value: NewsItem["category"]; label: string }> = [
  { value: "exposicion", label: "Exposición" }, { value: "premio", label: "Premio" },
  { value: "entrevista", label: "Entrevista" }, { value: "publicacion", label: "Publicación" },
  { value: "evento", label: "Evento" }, { value: "television", label: "Televisión" },
];
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const maxImageSize = 25 * 1024 * 1024;

/** A local gallery draft. Files and removals are not published until Save. */
export function NewsEditorDialog({ newsItem, onClose, onSaved }: NewsEditorDialogProps) {
  const { language } = useSitePreferences();
  const [activeLocale, setActiveLocale] = useState<EditorLocale>(() => newsItem ? language : "es");
  const [values, setValues] = useState<LocaleValues<NewsFields>>(() => createLocaleValues<NewsFields>({
    title: newsItem?.title ?? "", dateText: newsItem?.dateText ?? "", location: newsItem?.location ?? "",
    description: newsItem?.description ?? "", imageAlt: newsItem?.imageAlt ?? newsItem?.title ?? "",
  }, newsItem?.translations as unknown as LocalizedFields<NewsFields> | undefined));
  const [publishedAt, setPublishedAt] = useState(() => newsItem ? newsItem.publishedAt ?? "" : localDate());
  const [category, setCategory] = useState<NewsItem["category"]>(() => newsItem?.category ?? "evento");
  const [externalUrl, setExternalUrl] = useState(() => newsItem?.externalUrl ?? "");
  const [images, setImages] = useState<GalleryEntry[]>(() => initialGallery(newsItem));
  const imagesRef = useRef(images);
  const initialImageOrder = useRef(images.map((entry) => entry.id).join("|"));
  const previewUrls = useRef(new Set<string>());
  const uploadedUrls = useRef(new Map<string, string>());
  const nextImageId = useRef(1);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const galleryList = useRef<HTMLOListElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("editing");
  const fieldsLocked = isSubmitting || saveState !== "editing";

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isSubmitting) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [isSubmitting]);

  function replaceImages(next: GalleryEntry[]) {
    imagesRef.current = next;
    setImages(next);
  }

  function updateField(field: keyof NewsFields, value: string) {
    setValues((current) => ({ ...current, [activeLocale]: { ...current[activeLocale], [field]: value } }));
  }

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = ""; // A removed file can be picked again, including in the next batch.
    if (fieldsLocked || !files.length) return;
    const errors: string[] = [];
    const next = [...imagesRef.current];
    const fingerprints = new Set(next.flatMap((entry) => entry.kind === "file" ? [fileFingerprint(entry.file)] : []));
    let added = 0;
    for (const file of files) {
      const validation = validateImage(file);
      if (validation) { errors.push(`${file.name}: ${validation}`); continue; }
      const fingerprint = fileFingerprint(file);
      if (fingerprints.has(fingerprint)) { errors.push(`${file.name}: esta imagen ya está en la selección.`); continue; }
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      fingerprints.add(fingerprint);
      next.push({ id: `file-${nextImageId.current++}`, kind: "file", file, previewUrl });
      added += 1;
    }
    replaceImages(next);
    setUploadErrors(errors);
    setStatus(added ? `${added} ${added === 1 ? "imagen añadida" : "imágenes añadidas"}. Total: ${next.length}.` : "No se han añadido imágenes.");
  }

  function removeImage(id: string) {
    if (fieldsLocked) return;
    const index = imagesRef.current.findIndex((item) => item.id === id);
    const entry = imagesRef.current[index];
    if (!entry) return;
    if (entry.kind === "file") {
      URL.revokeObjectURL(entry.previewUrl);
      previewUrls.current.delete(entry.previewUrl);
    }
    const next = imagesRef.current.filter((item) => item.id !== id);
    replaceImages(next);
    setStatus("Imagen retirada de la selección. La galería publicada no cambia hasta guardar.");
    // Removing the focused button must not release keyboard focus behind the dialog.
    requestAnimationFrame(() => {
      if (!alive.current) return;
      const neighbor = next[Math.min(index, next.length - 1)];
      const card = Array.from(galleryList.current?.children ?? []).find((item) => item instanceof HTMLElement && item.dataset.imageKey === neighbor?.id);
      const target = card?.querySelector<HTMLButtonElement>(".news-editor-remove");
      (target ?? imageInput.current)?.focus();
    });
  }

  function moveImage(id: string, direction: -1 | 1) {
    if (fieldsLocked) return;
    const next = [...imagesRef.current];
    const from = next.findIndex((entry) => entry.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    replaceImages(next);
    setStatus(`Imagen en la posición ${to + 1}.${to === 0 ? " Es la portada de la noticia." : ""}`);
  }

  function markPreviewError(id: string) {
    if (!alive.current) return;
    replaceImages(imagesRef.current.map((entry) => entry.id === id ? { ...entry, previewError: true } : entry));
  }

  async function reloadSavedNews() {
    try {
      await onSaved();
      if (alive.current) onClose();
    } catch (failure) {
      if (alive.current) setError(`${saveState === "saved" ? "La noticia está guardada" : "No se ha podido comprobar si la noticia se guardó"}, pero no se ha podido recargar. ${errorMessage(failure)}`);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    if (saveState === "editing") {
      if (!values.es.title.trim()) {
        setActiveLocale("es");
        setError(`Completa el título en español antes de ${newsItem ? "guardar" : "crear"} la noticia.`);
        requestAnimationFrame(() => titleInput.current?.focus());
        return;
      }
      if (externalUrl.trim() && !getNewsExternalUrl(externalUrl)) {
        setError("El enlace externo debe ser una dirección http:// o https:// válida.");
        return;
      }
    }
    busyRef.current = true;
    setIsSubmitting(true);
    setError(null);
    if (saveState !== "editing") {
      await reloadSavedNews();
      busyRef.current = false;
      if (alive.current) { setIsSubmitting(false); setStatus(""); }
      return;
    }

    const draft = [...imagesRef.current];
    let writeStarted = false;
    let writeConfirmed = false;
    try {
      const pending = draft.filter((entry): entry is Extract<GalleryEntry, { kind: "file" }> => entry.kind === "file");
      // Decode all new files before uploading any of them. A renamed text file
      // must not become a broken public gallery image.
      for (const entry of pending) {
        if (uploadedUrls.current.has(entry.id)) continue;
        setStatus(`Comprobando ${entry.file.name}…`);
        const dimensions = entry.previewError ? null : await getImageDimensions(entry.file);
        if (!dimensions?.width || !dimensions.height) throw new Error(`No se puede leer «${entry.file.name}». Retira esa imagen y selecciona un archivo válido.`);
        if (!alive.current) return;
      }
      for (let index = 0; index < pending.length; index += 1) {
        const entry = pending[index];
        if (uploadedUrls.current.has(entry.id)) continue;
        setStatus(`Subiendo imagen ${index + 1} de ${pending.length}…`);
        uploadedUrls.current.set(entry.id, await uploadEditableAsset("news", entry.file));
        if (!alive.current) return;
      }
      const imageAlt = values.es.imageAlt.trim() || values.es.title.trim();
      const finalImages: NewsImage[] = draft.map((entry) => entry.kind === "existing"
        ? { ...entry.image }
        : { url: uploadedUrls.current.get(entry.id)!, alt: imageAlt });
      const galleryChanged = draft.map((entry) => entry.id).join("|") !== initialImageOrder.current;
      const input = {
        title: values.es.title, publishedAt, dateText: values.es.dateText, category,
        location: values.es.location, description: values.es.description, externalUrl,
        imageAlt, translations: toStoredTranslations(values) as NewsTranslations,
      };
      setStatus("Guardando noticia…");
      writeStarted = true;
      if (newsItem) await updateNewsItem({ ...input, id: newsItem.id, ...(galleryChanged ? { images: finalImages } : {}) });
      else await createNewsItem({ ...input, imageUrls: finalImages.map((image) => image.url), images: finalImages });
      writeConfirmed = true;
      if (!alive.current) return;
      setSaveState("saved");
      await onSaved();
      if (alive.current) onClose();
    } catch (failure) {
      if (!alive.current) return;
      // Never delete an upload here: a lost response can hide a committed save.
      // Cached upload URLs also make a known, rejected transaction safe to retry.
      if (writeConfirmed) {
        setSaveState("saved");
        setError(`La noticia se ha guardado, pero no se ha podido recargar. ${errorMessage(failure)} No vuelvas a crearla; pulsa «Volver a cargar».`);
      } else if (writeStarted && !isDefinitelyRejected(failure)) {
        setSaveState("uncertain");
        setError(`No se ha podido confirmar el guardado. ${errorMessage(failure)} Pulsa «Comprobar guardado» para recargar las noticias antes de repetir la operación. Las imágenes subidas se conservan.`);
      } else setError(errorMessage(failure));
    } finally {
      busyRef.current = false;
      if (alive.current) { setIsSubmitting(false); setStatus(""); }
    }
  }

  const fields = values[activeLocale];
  const imageCount = `${images.length} ${images.length === 1 ? "imagen" : "imágenes"}`;

  return <AdminDialog title={newsItem ? "Editar noticia" : "Añadir noticia"} onClose={() => { if (!busyRef.current) onClose(); }}
    closeDisabled={isSubmitting} className="admin-dialog--wide news-editor-dialog">
    <form className="admin-form news-editor-form" onSubmit={handleSubmit} aria-busy={isSubmitting}>
      <div className="news-editor-body">
        <p className="news-editor-intro">Prepara la noticia, sus traducciones y las imágenes. Los cambios se publican al guardar.</p>
        <fieldset className="news-editor-section" disabled={fieldsLocked}>
          <legend>Información de la noticia</legend>
          <div className="news-editor-info-grid">
            <label>Fecha<input type="date" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} /></label>
            <label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value as NewsItem["category"])}>{newsCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="news-editor-wide">Enlace externo<input type="url" aria-label="Enlace externo" aria-describedby="news-editor-link-help" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://…" /><small id="news-editor-link-help">Opcional: artículo, exposición o página relacionada.</small></label>
          </div>
        </fieldset>

        <fieldset className="news-editor-section" disabled={fieldsLocked}>
          <legend>Contenido y traducciones</legend>
          <TranslationTabs activeLocale={activeLocale} onSelect={setActiveLocale} isComplete={(locale) => Boolean(values[locale].title.trim())}>
            <label>Título<input ref={titleInput} value={fields.title} onChange={(event) => updateField("title", event.target.value)} required={activeLocale === "es"} /></label>
            <div className="news-editor-info-grid">
              <label>Fecha visible<input value={fields.dateText} onChange={(event) => updateField("dateText", event.target.value)} placeholder="Septiembre de 2026" /></label>
              <label>Ubicación<input value={fields.location} onChange={(event) => updateField("location", event.target.value)} placeholder="Palma, Mallorca" /></label>
            </div>
            <label>Descripción<textarea rows={7} value={fields.description} onChange={(event) => updateField("description", event.target.value)} /></label>
            <label>Texto alternativo de imágenes<input aria-label="Texto alternativo de imágenes" aria-describedby="news-editor-alt-help" value={fields.imageAlt} onChange={(event) => updateField("imageAlt", event.target.value)} /><small id="news-editor-alt-help">Describe brevemente las fotografías para quien no pueda verlas.</small></label>
          </TranslationTabs>
          <p className="news-editor-help">Editas el idioma seleccionado. Los demás se conservan, igual que los párrafos y los saltos de línea del texto.</p>
        </fieldset>

        <fieldset className="news-editor-section news-editor-gallery-section" disabled={fieldsLocked}>
          <legend>Galería de imágenes</legend>
          <div className="news-editor-gallery-heading"><p>La primera imagen será la portada. Puedes cambiar el orden o quitar imágenes antes de guardar.</p><span className="news-editor-count">{imageCount}</span></div>
          <label className="news-editor-upload">
            <ImagePlus aria-hidden="true" /><span>Añadir imágenes</span>
            <small>JPEG, PNG, WebP, GIF o AVIF. Hasta 25 MB por imagen. Puedes añadir varios lotes.</small>
            <input ref={imageInput} type="file" aria-label="Añadir imágenes" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={addImages} />
          </label>
          {uploadErrors.length > 0 ? <ul className="news-editor-upload-errors" role="alert">{uploadErrors.map((message, index) => <li key={index}>{message}</li>)}</ul> : null}
          {images.length ? <ol ref={galleryList} className="news-editor-gallery" aria-label="Imágenes de la noticia">
            {images.map((entry, index) => <li className="news-editor-image" data-image-key={entry.id} key={entry.id}>
              <div className="news-editor-image-preview">
                {entry.previewError ? <span className="news-editor-image-fallback"><ImageOff aria-hidden="true" />No se puede mostrar la imagen</span>
                  : <img src={entry.previewUrl} alt={`Vista previa: ${entry.kind === "file" ? entry.file.name : entry.image.alt || `imagen ${index + 1}`}`} onError={() => markPreviewError(entry.id)} />}
                {index === 0 ? <span className="news-editor-cover">Portada</span> : null}
              </div>
              <div className="news-editor-image-caption"><strong>{entry.kind === "file" ? entry.file.name : entry.image.caption || `Imagen ${index + 1}`}</strong><small>{entry.kind === "file" ? `${formatFileSize(entry.file.size)} · Nueva` : "Guardada"}</small></div>
              <div className="news-editor-image-actions">
                <button type="button" aria-label={`Adelantar imagen ${index + 1}`} disabled={fieldsLocked || index === 0} onClick={() => moveImage(entry.id, -1)}><ArrowUp aria-hidden="true" /></button>
                <button type="button" aria-label={`Retrasar imagen ${index + 1}`} disabled={fieldsLocked || index === images.length - 1} onClick={() => moveImage(entry.id, 1)}><ArrowDown aria-hidden="true" /></button>
                <button type="button" className="news-editor-remove" aria-label={`Quitar imagen ${index + 1}`} disabled={fieldsLocked} onClick={() => removeImage(entry.id)}><Trash2 aria-hidden="true" /><span>Quitar</span></button>
              </div>
            </li>)}
          </ol> : <p className="news-editor-empty">Todavía no hay imágenes. Puedes publicar la noticia solo con texto o añadir fotografías.</p>}
          <p className="news-editor-help">Quitar una imagen la retira de esta noticia al guardar; no borra el archivo del almacenamiento. Cancelar no modifica la galería publicada.</p>
        </fieldset>
      </div>

      <footer className="news-editor-footer">
        <div className="news-editor-feedback"><FormMessage error={error} /><p className="news-editor-status" role="status" aria-live="polite">{status}</p></div>
        <div className="news-editor-footer-actions">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>{saveState === "editing" ? "Cancelar" : "Cerrar"}</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Guardando..." : saveState === "saved" ? "Volver a cargar" : saveState === "uncertain" ? "Comprobar guardado" : newsItem ? "Guardar noticia" : "Crear noticia"}
          </button>
        </div>
      </footer>
    </form>
  </AdminDialog>;
}

function initialGallery(newsItem?: NewsItem): GalleryEntry[] {
  const images = newsItem?.images?.length ? newsItem.images : newsItem?.imageUrl ? [{ url: newsItem.imageUrl, alt: newsItem.imageAlt }] : [];
  return images.map((image, index) => ({ id: `existing-${index}`, kind: "existing", image: structuredClone(image), previewUrl: image.url }));
}

function validateImage(file: File) {
  if (!acceptedImageTypes.has(file.type)) return "selecciona una imagen JPEG, PNG, WebP, GIF o AVIF.";
  if (!file.size) return "el archivo está vacío.";
  if (file.size > maxImageSize) return "cada imagen debe ocupar como máximo 25 MB.";
  return null;
}

function fileFingerprint(file: File) { return `${file.name}|${file.size}|${file.type}|${file.lastModified}`; }
function formatFileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`; }
function errorMessage(error: unknown) { return getEditableOperationErrorMessage(error, "No se ha podido guardar la noticia. Inténtalo de nuevo."); }
function localDate() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; }

/** SQL validation/permission errors confirm that the atomic RPC was rejected.
 * Unknown/server/network errors are deliberately not considered safe to replay. */
function isDefinitelyRejected(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error && typeof error.code === "string" ? error.code : "";
  return /^(?:22|23|28|42|44)[A-Z0-9]{3}$/.test(code) || ["P0001", "P0002", "PGRST202", "PGRST204", "PGRST301"].includes(code);
}
