import { useRef, useState, type FormEvent } from "react";
import { Bold, ImagePlus, Italic, List, ListOrdered, LoaderCircle, Save, Upload } from "lucide-react";
import { getEditorialPageTranslations } from "../../data/editorialTranslations";
import {
  cleanupOwnedEditableAssets,
  createArtwork,
  createCollection,
  createNewsItem,
  getEditableOperationErrorMessage,
  getImageDimensions,
  updateArtwork,
  updateCollection,
  updateNewsItem,
  updatePhotographyItem,
  uploadEditableAsset,
  uploadEditableAssets,
  type EditableCollection,
} from "../../services/editableContentService";
import type { SupportKind } from "../../types/support";
import type { CurrentArtwork } from "../../types/currentSite";
import type { NewsItem } from "../../types/domain";
import { contentLocales } from "../../types/localization";
import type {
  ArtworkTranslations,
  CollectionTranslations,
  LocalizedFields,
  NewsTranslations,
  PageTranslations,
  PhotographyTranslations,
} from "../../types/localization";
import { AdminDialog, FormMessage } from "./AdminUi";
import {
  createLocaleValues,
  toStoredTranslations,
  TranslationTabs,
  type EditorLocale,
  type LocaleValues,
} from "./LocalizedFields";

type BiographyTextDialogProps = {
  html: string;
  translations?: PageTranslations;
  onClose: () => void;
  onSave: (input: { html: string; translations: PageTranslations }) => Promise<void>;
};

export function BiographyTextDialog({ html, onClose, onSave, translations }: BiographyTextDialogProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("es");
  const [values, setValues] = useState(() =>
    createLocaleValues<{ html: string }>(
      { html },
      translations as PageTranslations & { en?: { html?: string }; de?: { html?: string }; ca?: { html?: string } },
      getEditorialPageTranslations("biography") as PageTranslations & {
        en?: { html?: string };
        de?: { html?: string };
        ca?: { html?: string };
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
    const sanitizedValues = mapLocaleValues(nextValues, (value) => ({ html: sanitizeRichText(value.html) }));

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

type NewsEditorDialogProps = {
  newsItem?: NewsItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type NewsFields = {
  title: string;
  dateText: string;
  location: string;
  description: string;
  imageAlt: string;
};

const emptyNewsFields: NewsFields = {
  title: "",
  dateText: "",
  location: "",
  description: "",
  imageAlt: "",
};

const newsCategories: Array<{ value: NewsItem["category"]; label: string }> = [
  { value: "exposicion", label: "Exposición" },
  { value: "premio", label: "Premio" },
  { value: "entrevista", label: "Entrevista" },
  { value: "publicacion", label: "Publicación" },
  { value: "evento", label: "Evento" },
  { value: "television", label: "Televisión" },
];

export function NewsEditorDialog({ newsItem, onClose, onSaved }: NewsEditorDialogProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("es");
  const [values, setValues] = useState<LocaleValues<NewsFields>>(() =>
    createLocaleValues<NewsFields>(
      getNewsFields(newsItem),
      newsItem?.translations as unknown as LocalizedFields<NewsFields> | undefined,
    ),
  );
  const [publishedAt, setPublishedAt] = useState(() => newsItem?.publishedAt ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<NewsItem["category"]>(() => newsItem?.category ?? "evento");
  const [externalUrl, setExternalUrl] = useState(() => newsItem?.externalUrl ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof NewsFields, value: string) {
    setValues((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.es.title.trim()) {
      setError(`Completa el título en español antes de ${newsItem ? "guardar" : "crear"} la noticia.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    let imageUrls: string[] = [];
    let isCreated = false;

    try {
      if (newsItem) {
        await updateNewsItem({
          id: newsItem.id,
          title: values.es.title,
          publishedAt,
          dateText: values.es.dateText,
          category,
          location: values.es.location,
          description: values.es.description,
          externalUrl,
          imageAlt: values.es.imageAlt || values.es.title,
          translations: toStoredTranslations(values) as NewsTranslations,
        });
      } else {
        imageUrls = await uploadEditableAssets("news", files);
        await createNewsItem({
          title: values.es.title,
          publishedAt,
          dateText: values.es.dateText,
          category,
          location: values.es.location,
          description: values.es.description,
          externalUrl,
          imageAlt: values.es.imageAlt || values.es.title,
          imageUrls,
          translations: toStoredTranslations(values) as NewsTranslations,
        });
        isCreated = true;
      }
      await onSaved();
      onClose();
    } catch (submitError) {
      if (!isCreated) await cleanupOwnedEditableAssets(imageUrls);
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fields = values[activeLocale];

  return (
    <AdminDialog title={newsItem ? "Editar noticia" : "Añadir noticia"} onClose={isSubmitting ? () => undefined : onClose} className="admin-dialog--wide">
      <form className="admin-form admin-form--dialog admin-form--grid" onSubmit={handleSubmit}>
        <label>
          Fecha
          <input type="date" value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} />
        </label>
        <label>
          Categoría
          <select value={category} onChange={(event) => setCategory(event.target.value as NewsItem["category"])}>
            {newsCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="admin-form__wide">
          Enlace externo
          <input type="url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} />
        </label>
        {!newsItem ? (
          <label className="admin-form__wide admin-file-field">
            <ImagePlus aria-hidden="true" />
            <span>Imágenes</span>
            <input type="file" accept="image/*" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            {files.length > 0 ? <small>{files.length} {files.length === 1 ? "imagen seleccionada" : "imágenes seleccionadas"}</small> : null}
          </label>
        ) : null}
        <div className="admin-form__wide">
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
              Fecha visible
              <input value={fields.dateText} onChange={(event) => updateField("dateText", event.target.value)} placeholder="Marzo 2026" />
            </label>
            <label>
              Ubicación
              <input value={fields.location} onChange={(event) => updateField("location", event.target.value)} />
            </label>
            <label>
              Texto alternativo de imágenes
              <input value={fields.imageAlt} onChange={(event) => updateField("imageAlt", event.target.value)} />
            </label>
            <label>
              Descripción
              <textarea rows={5} value={fields.description} onChange={(event) => updateField("description", event.target.value)} />
            </label>
          </TranslationTabs>
        </div>
        <FormMessage error={error} />
        <div className="admin-dialog__actions admin-form__wide">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Guardando..." : newsItem ? "Guardar noticia" : "Crear noticia"}
          </button>
        </div>
      </form>
    </AdminDialog>
  );
}

function getNewsFields(newsItem?: NewsItem): NewsFields {
  if (!newsItem) return emptyNewsFields;

  return {
    title: newsItem.title,
    dateText: newsItem.dateText ?? "",
    location: newsItem.location ?? "",
    description: newsItem.description ?? "",
    imageAlt: newsItem.imageAlt ?? newsItem.title,
  };
}

type CollectionEditorDialogProps = {
  collection?: EditableCollection;
  supportKind: SupportKind;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

type CollectionFields = { title: string; description: string };
const emptyCollectionFields: CollectionFields = { title: "", description: "" };

export function CollectionEditorDialog({ collection, onClose, onSaved, supportKind }: CollectionEditorDialogProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("es");
  const [values, setValues] = useState<LocaleValues<CollectionFields>>(() =>
    createLocaleValues(
      collection ? { title: collection.title, description: collection.description } : emptyCollectionFields,
      collection?.translations,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supportTitle = supportKind === "canvas" ? "lienzos" : "láminas";

  function updateField(field: keyof CollectionFields, value: string) {
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
        await updateCollection({
          id: collection.id,
          title: values.es.title,
          description: values.es.description,
          translations: toStoredTranslations(values) as CollectionTranslations,
        });
      } else {
        await createCollection({
          supportKind,
          title: values.es.title,
          description: values.es.description,
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

  return (
    <AdminDialog title={collection ? `Editar colección de ${supportTitle}` : `Nueva colección de ${supportTitle}`} onClose={isSubmitting ? () => undefined : onClose}>
      <form className="admin-form admin-form--dialog" onSubmit={handleSubmit}>
        <TranslationTabs
          activeLocale={activeLocale}
          onSelect={setActiveLocale}
          isComplete={(locale) => Boolean(values[locale].title.trim())}
        >
          <label>
            Nombre
            <input value={fields.title} onChange={(event) => updateField("title", event.target.value)} required={activeLocale === "es"} />
          </label>
          <label>
            Descripción
            <textarea rows={5} value={fields.description} onChange={(event) => updateField("description", event.target.value)} />
          </label>
        </TranslationTabs>
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

export function ArtworkEditorDialog({ artwork, collectionId, collectionTitle, onClose, onSaved }: ArtworkEditorDialogProps) {
  const [activeLocale, setActiveLocale] = useState<EditorLocale>("es");
  const [values, setValues] = useState<LocaleValues<ArtworkFields>>(() =>
    createLocaleValues<ArtworkFields>(
      getArtworkFields(artwork),
      artwork?.translations as unknown as LocalizedFields<ArtworkFields> | undefined,
    ),
  );
  const [dimensions, setDimensions] = useState(() => artwork?.dimensions ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof ArtworkFields, value: string) {
    setValues((current) => ({
      ...current,
      [activeLocale]: { ...current[activeLocale], [field]: value },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!artwork && !file) {
      setError("Selecciona la imagen de la obra.");
      return;
    }
    if (!values.es.title.trim()) {
      setError(`Completa el título en español antes de ${artwork ? "guardar" : "añadir"} la obra.`);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    let imageUrl: string | null = null;
    let isCreated = false;

    try {
      if (artwork) {
        await updateArtwork({
          id: artwork.id,
          title: values.es.title,
          technique: values.es.technique,
          caption: values.es.caption,
          description: values.es.description,
          dimensions,
          translations: toStoredTranslations(values) as ArtworkTranslations,
        });
      } else {
        const imageSize = await getImageDimensions(file!);
        imageUrl = await uploadEditableAsset("artworks", file!);
        await createArtwork({
          collectionId,
          title: values.es.title,
          technique: values.es.technique,
          caption: values.es.caption,
          description: values.es.description,
          dimensions,
          imageUrl,
          width: imageSize.width,
          height: imageSize.height,
          translations: toStoredTranslations(values) as ArtworkTranslations,
        });
        isCreated = true;
      }
      await onSaved();
      onClose();
    } catch (submitError) {
      if (!isCreated && imageUrl) await cleanupOwnedEditableAssets([imageUrl]);
      setError(getErrorMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fields = values[activeLocale];

  return (
    <AdminDialog title={artwork ? `Editar obra de ${collectionTitle}` : `Añadir obra a ${collectionTitle}`} onClose={isSubmitting ? () => undefined : onClose} className="admin-dialog--wide">
      <form className="admin-form admin-form--dialog admin-form--grid" onSubmit={handleSubmit}>
        <label>
          Dimensiones
          <input value={dimensions} onChange={(event) => setDimensions(event.target.value)} placeholder="140 x 140 cm" />
        </label>
        {!artwork ? (
          <label className="admin-file-field">
            <Upload aria-hidden="true" />
            <span>Imagen de la obra</span>
            <input type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            {file ? <small>{file.name}</small> : null}
          </label>
        ) : null}
        <div className="admin-form__wide">
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
              Técnica
              <input value={fields.technique} onChange={(event) => updateField("technique", event.target.value)} />
            </label>
            <label>
              Pie de obra
              <input value={fields.caption} onChange={(event) => updateField("caption", event.target.value)} />
            </label>
            <label>
              Descripción
              <textarea rows={5} value={fields.description} onChange={(event) => updateField("description", event.target.value)} />
            </label>
          </TranslationTabs>
        </div>
        <FormMessage error={error} />
        <div className="admin-dialog__actions admin-form__wide">
          <button type="button" className="admin-secondary-button" disabled={isSubmitting} onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-primary-button" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="admin-button-spinner" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {isSubmitting ? "Procesando..." : artwork ? "Guardar obra" : "Añadir obra"}
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
