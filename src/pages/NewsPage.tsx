import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { useAdminSession } from "../app/adminSession";
import { useEditableContent, useEditableNewsItems, useEditingContent } from "../app/editableContent";
import { useSitePreferences } from "../app/sitePreferences";
import { NewsEditorDialog } from "../components/admin/ContentEditorDialogs";
import { ConfirmDialog, EditIconButton } from "../components/admin/AdminUi";
import { LoadingImage, PageLoader } from "../components/ui/Loaders";
import { NewsCarousel } from "../components/news/NewsCarousel";
import { getNewsDate, getNewsExternalUrl, getNewsImages, newsCategoryLabels, newsCategoryValues, newsCopy, normalizeNewsSearch } from "../lib/newsPresentation";
import { deleteNewsItem, getEditableOperationErrorMessage, loadEditableContent } from "../services/editableContentService";
import type { NewsImage, NewsItem } from "../types/domain";
import "../styles/news-feed.css";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const copy = newsCopy[language];
  const [activeImage, setActiveImage] = useState<NewsImage | null>(null);
  const [isNewsEditorOpen, setIsNewsEditorOpen] = useState(false);
  const [newsToEditId, setNewsToEditId] = useState<string | null>(null);
  const [newsToDeleteId, setNewsToDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const normalizedSearch = useMemo(() => normalizeNewsSearch(searchTerm), [searchTerm]);
  const filteredNews = useMemo(() => {
    return newsItems.filter((item) => {
      const matchesSearch = !normalizedSearch || normalizeNewsSearch([item.title, item.dateText, newsCategoryLabels[language][item.category], item.location, item.description].filter(Boolean).join(" ")).includes(normalizedSearch);
      const matchesCategory = category === "all" || item.category === category;
      const matchesFrom = !fromDate || Boolean(item.publishedAt && item.publishedAt >= fromDate);
      const matchesTo = !toDate || Boolean(item.publishedAt && item.publishedAt <= toDate);
      return matchesSearch && matchesCategory && matchesFrom && matchesTo;
    });
  }, [category, fromDate, language, newsItems, normalizedSearch, toDate]);
  const hasActiveFilters = Boolean(searchTerm || fromDate || toDate || category !== "all");
  const extraFilterCount = Number(Boolean(fromDate)) + Number(Boolean(toDate)) + Number(category !== "all");

  const newsToDelete = newsToDeleteId ? newsItems.find((item) => item.id === newsToDeleteId) ?? null : null;
  const newsToEdit = newsToEditId ? editableNewsItems.find((item) => item.id === newsToEditId) ?? null : null;

  async function refreshSavedNews() {
    // Do not let a failed follow-up read erase the current feed or unmount the
    // editing dialog. The editor must offer a read-only retry after a saved RPC.
    const confirmedSnapshot = await loadEditableContent();
    await refreshContent(confirmedSnapshot);
  }

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
      <section className={`page-section news-page news-page--feed${isEditMode ? " is-editing" : ""}`}>
        <div className="news-heading">
          <h1>{labels.nav.news}</h1>
        </div>
        {operationError ? <p className="editor-operation-feedback" role="alert">{operationError}</p> : null}

        <div className="news-filters" role="search">
          <div className="news-filters__toolbar">
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
            <button type="button" className="news-filters__toggle" aria-label={copy.filters} aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen(open => !open)}>
              <SlidersHorizontal aria-hidden="true" /><span>{copy.filters}</span>
              {extraFilterCount > 0 ? <span className="news-filters__badge">{extraFilterCount}</span> : null}
            </button>
          </div>
          <div className="news-filters__panel" id={filtersId} hidden={!filtersOpen}>
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
              {newsCategoryValues.map((value) => <option key={value} value={value}>{newsCategoryLabels[language][value]}</option>)}
            </select>
          </label>
          </div>
          {fromDate && toDate && fromDate > toDate ? <p className="news-filters__error" role="alert">{copy.dateRange}</p> : null}
          <div className="news-filters__summary">
            <span role="status" aria-atomic="true">{!isLoading ? `${filteredNews.length} ${filteredNews.length === 1 ? copy.result : copy.results}` : ""}</span>
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
          <div className="news-grid">
            {filteredNews.map((item) => (
              <NewsCard
                key={item.id}
                item={item}
                isEditing={isEditMode}
                onEdit={() => setNewsToEditId(item.id)}
                onDelete={() => setNewsToDeleteId(item.id)}
                onImageSelect={setActiveImage}
              />
            ))}
          </div>
        )}

        {!isLoading && filteredNews.length === 0 ? <p className="empty-state">{labels.actions.noNews}</p> : null}
      </section>

      {activeImage ? (
        <NewsImageDialog image={activeImage} onClose={() => setActiveImage(null)} />
      ) : null}

      {isNewsEditorOpen ? <NewsEditorDialog onClose={() => setIsNewsEditorOpen(false)} onSaved={refreshSavedNews} /> : null}

      {newsToEdit ? <NewsEditorDialog newsItem={newsToEdit} onClose={() => setNewsToEditId(null)} onSaved={refreshSavedNews} /> : null}

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

function NewsCard({
  item,
  isEditing,
  onEdit,
  onDelete,
  onImageSelect,
}: {
  item: NewsItem;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onImageSelect: (image: NewsImage) => void;
}) {
  const { language } = useSitePreferences();
  const images = getNewsImages(item);
  const externalUrl = getNewsExternalUrl(item.externalUrl);
  const date = getNewsDate(item, language);

  return (
    <article className="news-card">
      <header className="news-card__header">
        <div className="news-card__identity"><span>Toni Crespo</span><span>{newsCategoryLabels[language][item.category]}</span></div>
        {date ? <time className="news-card__date" dateTime={item.publishedAt || undefined}>{date}</time> : null}
      </header>
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
      <NewsCarousel images={images} title={item.title} onImageSelect={onImageSelect} />
      <div className="news-card__body">
        <h2>{item.title}</h2>
        {item.location ? <p className="news-card__location">{item.location}</p> : null}
        {item.description ? <p className="news-card__description">{item.description}</p> : null}
        {externalUrl ? (
          <a className="news-card__link" href={externalUrl} target="_blank" rel="noopener noreferrer">
            {newsCopy[language].visit}<ArrowUpRight aria-hidden="true" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

function NewsImageDialog({ image, onClose }: { image: NewsImage; onClose: () => void }) {
  const { language, labels } = useSitePreferences();
  const close = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("is-lightbox-open");
    close.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.classList.remove("is-lightbox-open");
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div className="photo-lightbox news-lightbox" role="dialog" aria-modal="true" aria-label={image.alt?.trim() || newsCopy[language].gallery} onClick={onClose}>
      <button ref={close} type="button" className="photo-lightbox__close" aria-label={labels.actions.closeImage} onClick={onClose} />
      <LoadingImage src={image.url} alt={image.alt ?? newsCopy[language].gallery} onClick={(event) => event.stopPropagation()} />
    </div>
  );
}
