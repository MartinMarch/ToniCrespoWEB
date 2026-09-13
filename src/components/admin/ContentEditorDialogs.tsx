import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bold, Italic, List, ListOrdered, LoaderCircle, Save, Upload } from "lucide-react";
import { getEditorialPageTranslations } from "../../data/editorialTranslations";
import { useSitePreferences } from "../../app/sitePreferences";
import {
  cleanupOwnedEditableAssets,
  createArtwork,
  createCollection,
  getEditableOperationErrorMessage,
  getImageDimensions,
  updateArtwork,
  updateCollection,
  updatePhotographyItem,
  uploadEditableAsset,
  type EditableCollection,
} from "../../services/editableContentService";
import type { SupportKind } from "../../types/support";
import type { CollectionDescriptionAlignment } from "../../types/collectionPresentation";
import { CollectionDescription } from "../support/CollectionDescription";
import type { CurrentArtwork } from "../../types/currentSite";
import { contentLocales } from "../../types/localization";
import type {
  ArtworkTranslations,
  CollectionTranslations,
  LocalizedFields,
  PageTranslations,
  PhotographyTranslations,
} from "../../types/localization";
import { AdminDialog, FormMessage } from "./AdminUi";
import "../../styles/artwork-availability.css";
import {
  createLocaleValues,
  toStoredTranslations,
  TranslationTabs,
  type EditorLocale,
  type LocaleValues,
} from "./LocalizedFields";

type BiographyTextDialogProps = {
  html: string;
  poem: string;
  translations?: PageTranslations;
  onClose: () => void;
  onSave: (input: { html: string; poem: string; translations: PageTranslations }) => Promise<void>;
};

export function BiographyTextDialog({ html, onClose, onSave, poem, translations }: BiographyTextDialogProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("es");
  const [values, setValues] = useState(() =>
    createLocaleValues<{ html: string; poem: string }>(
      { html, poem },
      translations as PageTranslations & { en?: { html?: string; poem?: string }; de?: { html?: string; poem?: string }; ca?: { html?: string; poem?: string } },
      getEditorialPageTranslations("biography") as PageTranslations & {
        en?: { html?: string; poem?: string };
        de?: { html?: string; poem?: string };
        ca?: { html?: string; poem?: string };
      },
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  function commitActiveHtml() {
    const nextHtml = editorRef.current?.innerHTML;
    if (nextHtml === undefined) return;
    setValues((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], html: nextHtml },
    }));
  }

  function handleLocaleChange(locale: EditorLocale) {
    commitActiveHtml();
    setActiveLocale(locale);
  }

  function applyFormat(command: "bold" | "insertOrderedList" | "insertUnorderedList" | "italic") {
    editorRef.current?.focus();
    document.execCommand(command, false);
    commitActiveHtml();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentHtml = editorRef.current?.innerHTML ?? values[activeLocale].html;
    const nextValues = {
      ...values,
      [activeLocale]: { ...values[activeLocale], html: currentHtml },
    };
    const sanitizedValues = mapLocaleValues(nextValues, (value) => ({ html: sanitizeRichText(value.html), poem: value.poem.trim() }));

    if (!getRichTextValue(sanitizedValues.es.html)) {
      setError("Completa el texto en español antes de guardar.");
      return;
    }

    setValues(sanitizedValues);
    setError(null);
    setIsSubmitting(true);

    try {
      await onSave({
        html: sanitizedValues.es.html,
        poem: sanitizedValues.es.poem,
        translations: preservePageTranslationTitles(
          toStoredTranslations(sanitizedValues) as PageTranslations,
          translations,
        ),
      });
      onClose();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminDialog title="Editar trayectoria" onClose={isSubmitting ? () => undefined : onClose} className="admin-dialog--wide">
      <form className="admin-form admin-form--dialog" onSubmit={handleSubmit}>
        <TranslationTabs
          activeLocale={activeLocale}
          onSelect={handleLocaleChange}
          isComplete={(locale) => Boolean(getRichTextValue(values[locale].html))}
        >
          <div className="rich-text-toolbar" aria-label="Formato de texto">
            <button type="button" aria-label="Negrita" title="Negrita" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("bold")}>
              <Bold aria-hidden="true" />
            </button>
            <button type="button" aria-label="Cursiva" title="Cursiva" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("italic")}>
              <Italic aria-hidden="true" />
            </button>
            <button type="button" aria-label="Lista" title="Lista" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("insertUnorderedList")}>
              <List aria-hidden="true" />
            </button>
            <button type="button" aria-label="Lista numerada" title="Lista numerada" onMouseDown={(event) => event.preventDefault()} onClick={() => applyFormat("insertOrderedList")}>
              <ListOrdered aria-hidden="true" />
            </button>
          </div>
          <div
            key={activeLocale}
            ref={editorRef}
            className="rich-text-editor"
            contentEditable={!isSubmitting}
            suppressContentEditableWarning
            dangerouslySetInnerHTML={{ __html: values[activeLocale].html }}
            onInput={commitActiveHtml}
          />
          <label className="biography-poem-editor">
            Poema al final de la trayectoria
            <textarea
              rows={10}
              value={values[activeLocale].poem}
              onChange={(event) => setValues((current) => ({
                ...current,
                [activeLocale]: { ...current[activeLocale], poem: event.target.value },
              }))}
              placeholder="Pega aquí el poema respetando sus saltos de línea"
            />
            <small>Se mostrará justificado y en cursiva, justo antes de las fotografías finales.</small>
          </label>
        </TranslationTabs>
        <FormMessage error={error} />
        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Guardando..." : "Guardar texto"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

export { NewsEditorDialog } from "./NewsEditorDialog";

type CollectionEditorDialogProps = {
  collection?: EditableCollection;
  supportKind: SupportKind;
  isActive?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type CollectionFields = { title: string; description: string };
const emptyCollectionFields: CollectionFields = { title: "", description: "" };

export function CollectionEditorDialog({ collection, isActive = true, onPendingChange, onClose, onSaved, supportKind }: CollectionEditorDialogProps) {
  const { language } = useSitePreferences();
  const [activeLocale, setActiveLocale] = useState<EditorLocale>(() => collection ? language : "es");
  const [values, setValues] = useState<LocaleValues<CollectionFields>>(() =>
    createLocaleValues(
      collection ? { title: collection.title, description: collection.description } : emptyCollectionFields,
      collection?.translations,
    ),
  );
  const [descriptionAlignment, setDescriptionAlignment] = useState<CollectionDescriptionAlignment>(() => collection?.descriptionAlignment === "center" ? "center" : "justify");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supportTitle = supportKind === "canvas" ? "lienzos" : "obra en papel";
  useDialogPendingChange(isSubmitting, onPendingChange);

  function updateField(field: keyof CollectionFields, value: string) {
    if (collection?.isRecent && field === "title") return;
    setValues((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.es.title.trim()) {
      setError(`Completa el nombre en español antes de ${collection ? "guardar" : "crear"} la colección.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      if (collection) {
        const translations = toStoredTranslations(values) as CollectionTranslations;
        if (collection.isRecent) {
          for (const locale of contentLocales) {
            const originalTitle = collection.translations?.[locale]?.title;
            if (originalTitle !== undefined) {
              translations[locale] = { ...translations[locale], title: originalTitle };
            } else if (translations[locale]) {
              delete translations[locale]!.title;
            }
          }
        }
        await updateCollection({
          id: collection.id,
          title: collection.isRecent ? collection.title : values.es.title,
          description: values.es.description,
          descriptionAlignment,
          translations,
        });
      } else {
        await createCollection({
          supportKind,
          title: values.es.title,
          description: values.es.description,
          descriptionAlignment,
          translations: toStoredTranslations(values) as CollectionTranslations,
        });
      }
      await onSaved();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fields = values[activeLocale];
  const previewDescription = fields.description.trim() ? fields.description : values.es.description;

  return (
    <AdminDialog title={collection?.isRecent ? `Editar descripción de ${collection.title}` : collection ? `Editar colección de ${supportTitle}` : `Nueva colección de ${supportTitle}`} isActive={isActive} onClose={isSubmitting ? () => undefined : onClose}>
      <form className="admin-form admin-form--dialog" onSubmit={handleSubmit}>
        {collection?.isRecent ? <p className="admin-form__message">Esta colección es permanente. Su nombre no se puede cambiar; puedes editar su descripción en cada idioma.</p> : null}
        <TranslationTabs
          activeLocale={activeLocale}
          onSelect={setActiveLocale}
          isComplete={(locale) => Boolean(values[locale].title.trim())}
        >
          <label>
            Nombre
            <input value={fields.title} onChange={(event) => updateField("title", event.target.value)} required={activeLocale === "es"} disabled={isSubmitting || collection?.isRecent === true} />
          </label>
          <label>
            Descripción
            <textarea rows={5} value={fields.description} onChange={(event) => updateField("description", event.target.value)} disabled={isSubmitting} />
          </label>
          <p className="admin-form__message">La descripción aparece debajo del nombre en el listado de colecciones y al entrar en ella. Se conservan los saltos de línea. Editas el idioma seleccionado; las otras traducciones no se sustituyen.</p>
        </TranslationTabs>
        <fieldset className="collection-description-alignment" disabled={isSubmitting}>
          <legend>Alineación de la descripción</legend>
          <div className="collection-description-alignment__options">
            <label>
              <input type="radio" name="collection-description-alignment" value="justify" checked={descriptionAlignment === "justify"} onChange={() => setDescriptionAlignment("justify")} />
              Justificada
            </label>
            <label>
              <input type="radio" name="collection-description-alignment" value="center" checked={descriptionAlignment === "center"} onChange={() => setDescriptionAlignment("center")} />
              Centrada
            </label>
          </div>
          <p className="admin-form__message">La alineación se aplica a todos los idiomas.</p>
        </fieldset>
        <section className="collection-description-preview" aria-label="Vista previa de la descripción">
          <p className="admin-form__message">Vista previa de la descripción</p>
          {previewDescription.trim() ? (
            <CollectionDescription description={previewDescription} alignment={descriptionAlignment} compact />
          ) : <p className="admin-form__message">Escribe una descripción para ver aquí cómo quedará.</p>}
          {activeLocale !== "es" && !fields.description.trim() && values.es.description.trim() ? (
            <p className="admin-form__message">Sin traducción en este idioma, se mostrará la descripción en español.</p>
          ) : null}
        </section>
        <FormMessage error={error} />
        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Guardando..." : collection ? "Guardar colección" : "Crear colección"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

type ArtworkEditorDialogProps = {
  artwork?: CurrentArtwork;
  collectionId: string;
  collectionTitle: string;
  collectionOptions?: EditableCollection[];
  isActive?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type ArtworkFields = {
  title: string;
  technique: string;
  caption: string;
  description: string;
};

const emptyArtworkFields: ArtworkFields = {
  title: "",
  technique: "",
  caption: "",
  description: "",
};

export function ArtworkEditorDialog({ artwork, collectionId, collectionTitle, collectionOptions, isActive = true, onPendingChange, onClose, onSaved }: ArtworkEditorDialogProps) {
  const { language } = useSitePreferences();
  const [activeLocale, setActiveLocale] = useState<EditorLocale>(() => artwork ? language : "es");
  const [values, setValues] = useState<LocaleValues<ArtworkFields>>(() =>
    createLocaleValues<ArtworkFields>(
      getArtworkFields(artwork),
      artwork?.translations as unknown as LocalizedFields<ArtworkFields> | undefined,
    ),
  );
  const [dimensions, setDimensions] = useState(() => artwork?.dimensions ?? "");
  const [isAvailable, setIsAvailable] = useState(() => artwork?.isAvailable !== false);
  const [isPublished, setIsPublished] = useState(() => artwork?.isPublished !== false);
  const [selectedCollectionId, setSelectedCollectionId] = useState(collectionId);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  useDialogPendingChange(isSubmitting, onPendingChange);
  const initialSupportKind = collectionOptions?.find((collection) => collection.id === collectionId)?.supportKind;
  const destinationCollections = collectionOptions?.filter((collection) => !initialSupportKind || collection.supportKind === initialSupportKind);
  const destinationTitle = destinationCollections?.find((collection) => collection.id === selectedCollectionId)?.title ?? collectionTitle;

  function updateField(field: keyof ArtworkFields, value: string) {
    setValues((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (hasSaved) {
      // Reload failures must never repeat an already confirmed insert/update.
      setIsSubmitting(true);
      setError(null);
      try { await onSaved(); onClose(); }
      catch (reloadError) { setError(`La obra se ha guardado, pero no se ha podido recargar. ${getErrorMessage(reloadError)}`); }
      finally { setIsSubmitting(false); }
      return;
    }
    if (!artwork && !file) {
      setError("Selecciona la imagen de la obra.");
      return;
    }
    if (!values.es.title.trim()) {
      setError(`Completa el título en español antes de ${artwork ? "guardar" : "añadir"} la obra.`);
      return;
    }
    if (!artwork && destinationCollections && !destinationCollections.some((collection) => collection.id === selectedCollectionId)) {
      setError("Selecciona una colección de destino válida.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    let imageUrl: string | null = null;
    let writeStarted = false;
    let writeConfirmed = false;

    try {
      let imageSize: { width: number | null; height: number | null } | null = null;
      if (file) {
        imageSize = await getImageDimensions(file);
        if (!imageSize.width || !imageSize.height) throw new Error("No se ha podido leer la imagen. Selecciona una imagen válida.");
        imageUrl = await uploadEditableAsset("artworks", file);
      }
      if (artwork) {
        writeStarted = true;
        await updateArtwork({
          id: artwork.id,
          title: values.es.title,
          technique: values.es.technique,
          caption: values.es.caption,
          description: values.es.description,
          dimensions,
          isAvailable,
          isPublished,
          ...(imageUrl && imageSize ? { replacementImage: { imageUrl, ...imageSize } } : {}),
          translations: toStoredTranslations(values) as ArtworkTranslations,
        });
      } else {
        writeStarted = true;
        await createArtwork({
          collectionId: selectedCollectionId,
          title: values.es.title,
          technique: values.es.technique,
          caption: values.es.caption,
          description: values.es.description,
          dimensions,
          isAvailable,
          isPublished,
          imageUrl: imageUrl!,
          width: imageSize!.width,
          height: imageSize!.height,
          translations: toStoredTranslations(values) as ArtworkTranslations,
        });
      }
      writeConfirmed = true;
      setHasSaved(true);
      await onSaved();
      onClose();
    } catch (submitError) {
      // A lost response can hide a committed write. Keep its upload, and never
      // delete old/shared images when replacing the photograph of one work.
      if (!writeStarted && imageUrl) await cleanupOwnedEditableAssets([imageUrl]);
      setError(writeConfirmed
        ? `La obra se ha guardado, pero no se ha podido recargar. ${getErrorMessage(submitError)}`
        : `${getErrorMessage(submitError)}${writeStarted ? " Si se interrumpió la conexión, recarga el catálogo antes de repetir para comprobar si llegó a guardarse." : ""}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const fields = values[activeLocale];

  return (
    <AdminDialog title={artwork ? `Editar obra de ${collectionTitle}` : `Añadir obra a ${destinationTitle}`} isActive={isActive} onClose={isSubmitting ? () => undefined : onClose} className="admin-dialog--wide">
      <form className="admin-form admin-form--dialog admin-form--grid" onSubmit={handleSubmit}>
        {!artwork && destinationCollections ? (
          <label className="admin-form__wide">
            Colección
            <select value={selectedCollectionId} onChange={(event) => setSelectedCollectionId(event.target.value)} disabled={isSubmitting || hasSaved} required>
              {!destinationCollections.some((collection) => collection.id === selectedCollectionId) ? <option value="">Selecciona una colección</option> : null}
              {destinationCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          Dimensiones
          <input value={dimensions} onChange={(event) => setDimensions(event.target.value)} placeholder="140 x 140 cm" disabled={isSubmitting || hasSaved} />
        </label>
        <label className="admin-file-field">
          <Upload aria-hidden="true" />
          <span>Imagen de la obra</span>
          <input type="file" accept="image/*" aria-label="Imagen de la obra" onChange={(event) => setFile(event.target.files?.[0] ?? null)} disabled={isSubmitting || hasSaved} />
          {file ? <small>{file.name}</small> : artwork ? <small>Opcional: si no eliges una imagen, se mantiene la actual.</small> : null}
          {artwork ? <small>La nueva imagen sustituirá la foto de esta ficha; los archivos anteriores se conservarán.</small> : null}
        </label>
        <fieldset className="artwork-editor-state admin-form__wide" disabled={isSubmitting || hasSaved}>
          <legend>Estado de la obra</legend>
          <label><input type="checkbox" checked={isAvailable} onChange={(event) => setIsAvailable(event.target.checked)} />Disponible</label>
          <label><input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} />Visible al público</label>
          <p>Una obra no disponible puede seguir visible. Desmarca «Visible al público» para ocultarla sin borrarla.</p>
        </fieldset>
        <div className="admin-form__wide">
          <TranslationTabs
            activeLocale={activeLocale}
            onSelect={setActiveLocale}
            isComplete={(locale) => Boolean(values[locale].title.trim())}
          >
            <label>
              Título
              <input value={fields.title} onChange={(event) => updateField("title", event.target.value)} required={activeLocale === "es"} disabled={isSubmitting || hasSaved} />
            </label>
            <label>
              Técnica
              <input value={fields.technique} onChange={(event) => updateField("technique", event.target.value)} disabled={isSubmitting || hasSaved} />
            </label>
            <label>
              Pie de obra
              <input value={fields.caption} onChange={(event) => updateField("caption", event.target.value)} disabled={isSubmitting || hasSaved} />
            </label>
            <label>
              Descripción
              <textarea rows={5} value={fields.description} onChange={(event) => updateField("description", event.target.value)} disabled={isSubmitting || hasSaved} />
            </label>
          </TranslationTabs>
        </div>
        <FormMessage error={error} />
        <div className="admin-dialog__actions admin-form__wide">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Procesando..." : hasSaved ? "Volver a cargar" : artwork ? "Guardar obra" : "Añadir obra"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function getArtworkFields(artwork?: CurrentArtwork): ArtworkFields {
  if (!artwork) return emptyArtworkFields;

  return {
    title: artwork.title,
    technique: artwork.technique ?? "",
    caption: artwork.caption,
    description: artwork.description,
  };
}

function useDialogPendingChange(isSubmitting: boolean, onPendingChange?: (pending: boolean) => void) {
  useEffect(() => {
    onPendingChange?.(isSubmitting);
    return () => onPendingChange?.(false);
  }, [isSubmitting, onPendingChange]);
}

type PhotographyEditorDialogProps = {
  photo: CurrentArtwork;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type PhotographyFields = {
  title: string;
  imageAlt: string;
};

export function PhotographyEditorDialog({ onClose, onSaved, photo }: PhotographyEditorDialogProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("es");
  const [values, setValues] = useState<LocaleValues<PhotographyFields>>(() =>
    createLocaleValues<PhotographyFields>(
      { title: photo.title, imageAlt: photo.imageAlt ?? photo.title },
      photo.translations as unknown as LocalizedFields<PhotographyFields> | undefined,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof PhotographyFields, value: string) {
    setValues((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.es.title.trim()) {
      setError("Completa el título en español antes de guardar la fotografía.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await updatePhotographyItem({
        id: photo.id,
        title: values.es.title,
        imageAlt: values.es.imageAlt || values.es.title,
        translations: toStoredTranslations(values) as PhotographyTranslations,
      });
      await onSaved();
      onClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fields = values[activeLocale];

  return (
    <AdminDialog title="Editar fotografía" onClose={isSubmitting ? () => undefined : onClose}>
      <form className="admin-form admin-form--dialog" onSubmit={handleSubmit}>
        <TranslationTabs
          activeLocale={activeLocale}
          onSelect={setActiveLocale}
          isComplete={(locale) => Boolean(values[locale].title.trim())}
        >
          <label>
            Título
            <input value={fields.title} onChange={(event) => updateField("title", event.target.value)} required={activeLocale === "es"} />
          </label>
          <label>
            Texto alternativo
            <input value={fields.imageAlt} onChange={(event) => updateField("imageAlt", event.target.value)} />
          </label>
        </TranslationTabs>
        <FormMessage error={error} />
        <div className="admin-dialog__actions">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Guardando..." : "Guardar fotografía"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function mapLocaleValues<T extends object>(values: LocaleValues<T>, mapper: (value: T) => T): LocaleValues<T> {
  return {
    es: mapper(values.es),
    en: mapper(values.en),
    de: mapper(values.de),
    ca: mapper(values.ca),
  };
}

function getRichTextValue(html: string) {
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.trim() ?? "";
}

function preservePageTranslationTitles(next: PageTranslations, current?: PageTranslations): PageTranslations {
  const translations = { ...next };

  for (const locale of contentLocales) {
    const title = current?.[locale]?.title?.trim();
    if (title) translations[locale] = { ...translations[locale], title };
  }

  return translations;
}

function sanitizeRichText(html: string) {
  const documentFragment = new DOMParser().parseFromString(html, "text/html");
  const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "DIV", "EM", "H2", "H3", "H4", "I", "LI", "OL", "P", "STRONG", "UL"]);

  for (const element of Array.from(documentFragment.body.querySelectorAll("*"))) {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    for (const attribute of Array.from(element.attributes)) {
      const isSafeLink =
        element.tagName === "A" &&
        ["href", "target", "rel"].includes(attribute.name) &&
        (attribute.name !== "href" || /^(https?:|mailto:|\/)/i.test(attribute.value));
      if (!isSafeLink) element.removeAttribute(attribute.name);
    }
  }

  return documentFragment.body.innerHTML.trim();
}

function getErrorMessage(error: unknown) {
  return getEditableOperationErrorMessage(error);
}
