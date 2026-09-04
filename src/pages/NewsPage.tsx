import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useAdminSession } from "../app/adminSession";
import { useEditableContent, useEditableNewsItems, useEditingContent } from "../app/editableContent";
import { useSitePreferences } from "../app/sitePreferences";
import { NewsEditorDialog } from "../components/admin/ContentEditorDialogs";
import { ConfirmDialog, EditIconButton } from "../components/admin/AdminUi";
import { LoadingImage, PageLoader } from "../components/ui/Loaders";
import { deleteNewsItem, getEditableOperationErrorMessage } from "../services/editableContentService";
import type { NewsImage, NewsItem } from "../types/domain";

export function NewsPage() {
  const { labels, language } = useSitePreferences();
  const { isEditMode } = useAdminSession();
  const { isLoading, refreshContent } = useEditableContent();
  const newsItems = useEditableNewsItems();
  const editableNewsItems = useEditingContent().newsItems;
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [category, setCategory] = useState<NewsItem["category"] | "all">("all");
  const [activeImage, setActiveImage] = useState<NewsImage | null>(null);
  const [isNewsEditorOpen, setIsNewsEditorOpen] = useState(false);
  const [newsToEditId, setNewsToEditId] = useState<string | null>(null);
  const [newsToDeleteId, setNewsToDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const normalizedSearch = useMemo(() => normalizeSearch(searchTerm), [searchTerm]);
  const filteredNews = useMemo(() => {
    return newsItems.filter((item) => {
      const matchesSearch = !normalizedSearch || normalizeSearch(getSearchableNewsText(item)).includes(normalizedSearch);
      const matchesCategory = category === "all" || item.category === category;
      const matchesFrom = !fromDate || Boolean(item.publishedAt && item.publishedAt >= fromDate);
      const matchesTo = !toDate || Boolean(item.publishedAt && item.publishedAt <= toDate);
      return matchesSearch && matchesCategory && matchesFrom && matchesTo;
    });
  }, [category, fromDate, newsItems, normalizedSearch, toDate]);
  const hasActiveFilters = Boolean(searchTerm || fromDate || toDate || category !== "all");

  useEffect(() => {
    if (!activeImage) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveImage(null);
      }
    }

    document.documentElement.classList.add("is-lightbox-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.classList.remove("is-lightbox-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeImage]);

  const newsToDelete = newsToDeleteId ? newsItems.find((item) => item.id === newsToDeleteId) ?? null : null;
  const newsToEdit = newsToEditId ? editableNewsItems.find((item) => item.id === newsToEditId) ?? null : null;

  async function handleDeleteNews() {
    const item = editableNewsItems.find((candidate) => candidate.id === newsToDeleteId);
    if (!item) return;

    setOperationError(null);
    setIsDeleting(true);
    try {
      await deleteNewsItem({
        id: item.id,
        imageUrls: getNewsImages(item).map((image) => image.url),
      });
      await refreshContent();
      setNewsToDeleteId(null);
    } catch (error) {
      setOperationError(getEditableOperationErrorMessage(error, "No se pudo eliminar la noticia."));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <section className={`page-section news-page${isEditMode ? " is-editing" : ""}`}>
        <div className="news-heading">
          <h1>{labels.nav.news}</h1>
        </div>
        {operationError ? <p className="editor-operation-feedback" role="alert">{operationError}</p> : null}

        <div className="news-filters" role="search">
          <label className="news-search">
            <span className="editor-visually-hidden">{labels.actions.search}</span>
            <svg className="news-search__icon" aria-hidden="true" viewBox="0 0 24 24">
              <g>
                <path d="M21.53 20.47l-3.66-3.66C19.2 15.24 20 13.21 20 11c0-4.97-4.03-9-9-9s-9 4.03-9 9 4.03 9 9 9c2.22 0 4.24-.8 5.81-2.13l3.66 3.66a.75.75 0 0 0 1.06-1.06ZM3.5 11c0-4.14 3.37-7.5 7.5-7.5s7.5 3.36 7.5 7.5-3.37 7.5-7.5 7.5-7.5-3.36-7.5-7.5Z" />
              </g>
            </svg>
            <input
              className="news-search__input"
              placeholder={labels.actions.search}
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="news-filter-field">
            <span>{labels.newsFilters.from}</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label className="news-filter-field">
            <span>{labels.newsFilters.to}</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <label className="news-filter-field news-filter-field--category">
            <span>{labels.newsFilters.category}</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as NewsItem["category"] | "all")}>
              <option value="all">{labels.newsFilters.allCategories}</option>
              {newsCategoryValues.map((value) => <option key={value} value={value}>{getCategoryLabel(value, language)}</option>)}
            </select>
          </label>
          {hasActiveFilters ? (
            <button
              type="button"
              className="news-filters__clear"
              onClick={() => {
                setSearchTerm("");
                setFromDate("");
                setToDate("");
                setCategory("all");
              }}
            >
              {labels.newsFilters.clear}
            </button>
          ) : null}
        </div>

        {isEditMode ? (
          <div className="editor-page-action editor-page-action--news">
            <button type="button" className="editor-add-command" onClick={() => setIsNewsEditorOpen(true)}>
              <Plus aria-hidden="true" />
              <span>Añadir noticia</span>
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <PageLoader variant="list" />
        ) : (
          <div className="news-grid" aria-live="polite">
            {filteredNews.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                isEditing={isEditMode}
                onEdit={() => setNewsToEditId(item.id)}
                onDelete={() => setNewsToDeleteId(item.id)}
                onImageSelect={setActiveImage}
                visitLabel={labels.actions.visit}
              />
            ))}
          </div>
        )}

        {!isLoading && filteredNews.length === 0 ? <p className="empty-state">{labels.actions.noNews}</p> : null}
      </section>

      {activeImage ? (
        <div className="photo-lightbox" role="dialog" aria-modal="true" onClick={() => setActiveImage(null)}>
          <button type="button" className="photo-lightbox__close" aria-label={labels.actions.closeImage} />
          <LoadingImage src={activeImage.url} alt={activeImage.alt ?? "Imagen de noticia"} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}

      {isNewsEditorOpen ? <NewsEditorDialog onClose={() => setIsNewsEditorOpen(false)} onSaved={refreshContent} /> : null}

      {newsToEdit ? <NewsEditorDialog newsItem={newsToEdit} onClose={() => setNewsToEditId(null)} onSaved={refreshContent} /> : null}

      {newsToDelete ? (
        <ConfirmDialog
          title="Eliminar noticia"
          description={`Se eliminará “${newsToDelete.title}” y sus imágenes asociadas.`}
          isPending={isDeleting}
          onCancel={() => setNewsToDeleteId(null)}
          onConfirm={() => void handleDeleteNews()}
        />
      ) : null}
    </>
  );
}

const newsCategoryValues: NewsItem["category"][] = ["exposicion", "premio", "entrevista", "publicacion", "evento", "television"];

const categoryLabels: Record<string, Record<NewsItem["category"], string>> = {
  es: { exposicion: "Exposición", premio: "Premio", entrevista: "Entrevista", publicacion: "Publicación", evento: "Evento", television: "Televisión" },
  ca: { exposicion: "Exposició", premio: "Premi", entrevista: "Entrevista", publicacion: "Publicació", evento: "Esdeveniment", television: "Televisió" },
  en: { exposicion: "Exhibition", premio: "Award", entrevista: "Interview", publicacion: "Publication", evento: "Event", television: "Television" },
  de: { exposicion: "Ausstellung", premio: "Auszeichnung", entrevista: "Interview", publicacion: "Publikation", evento: "Veranstaltung", television: "Fernsehen" },
};

function getCategoryLabel(category: NewsItem["category"], language: string) {
  return categoryLabels[language]?.[category] ?? categoryLabels.es[category];
}

function NewsCard({
  item,
  isEditing,
  onEdit,
  onDelete,
  onImageSelect,
  visitLabel,
}: {
  item: NewsItem;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onImageSelect: (image: NewsImage) => void;
  visitLabel: string;
}) {
  const images = getNewsImages(item);

  return (
    <article className="news-card">
      {isEditing ? (
        <>
          <EditIconButton className="news-card__edit" label={`Editar noticia: ${item.title}`} onClick={onEdit}>
            <Pencil aria-hidden="true" />
          </EditIconButton>
          <EditIconButton className="news-card__delete" label={`Eliminar noticia: ${item.title}`} tone="danger" onClick={onDelete}>
            <Trash2 aria-hidden="true" />
          </EditIconButton>
        </>
      ) : null}
      <NewsMedia images={images} title={item.title} onImageSelect={onImageSelect} />
      <div className="news-card__body">
        <span className="news-card__date">{item.dateText}</span>
        <h2>{item.title}</h2>
        {item.location ? <p className="news-card__location">{item.location}</p> : null}
        {item.description ? <p className="news-card__description">{item.description}</p> : null}
        {item.externalUrl ? (
          <a className="news-card__link" href={item.externalUrl} target="_blank" rel="noreferrer">
            {visitLabel}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function NewsMedia({
  images,
  title,
  onImageSelect,
}: {
  images: NewsImage[];
  title: string;
  onImageSelect: (image: NewsImage) => void;
}) {
  if (images.length === 0) {
    return <div className="news-card__media news-card__media--empty" />;
  }

  const [primaryImage, ...secondaryImages] = images;

  return (
    <div className={`news-card__media${images.length > 1 ? " news-card__media--gallery" : ""}`}>
      <figure className="news-card__image news-card__image--primary">
        <button type="button" className="news-card__zoom-button" onClick={() => onImageSelect(primaryImage)}>
          <LoadingImage src={primaryImage.url} alt={primaryImage.alt ?? title} loading="lazy" />
        </button>
      </figure>
      {secondaryImages.length > 0 ? (
        <div className="news-card__thumbs" aria-label={`Más imágenes de ${title}`}>
          {secondaryImages.slice(0, 3).map((image) => (
            <figure key={image.url} className="news-card__image news-card__thumb">
              <button type="button" className="news-card__zoom-button" onClick={() => onImageSelect(image)}>
                <LoadingImage src={image.url} alt={image.alt ?? title} loading="lazy" />
              </button>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getNewsImages(item: NewsItem): NewsImage[] {
  if (item.images?.length) return item.images;
  if (!item.imageUrl) return [];

  return [
    {
      url: item.imageUrl,
      alt: item.imageAlt,
    },
  ];
}

function getSearchableNewsText(item: NewsItem) {
  return [item.title, item.dateText, item.category, item.location, item.description].filter(Boolean).join(" ");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
