import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent,
} from "react";
import { Eye, EyeOff, ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useContactDialog } from "../contact/ContactDialogProvider";
import { useSitePreferences, type SiteLabels } from "../../app/sitePreferences";
import { roomScenes, type ArtworkRoomScene } from "../../data/roomScenes";
import { getArtworkMetrics, getArtworkPlacement, getMockupsForArtwork } from "../../lib/artworkRoomGeometry";
import { getArtworkEditorialText } from "../../lib/artworkEditorialText";
import type { SupportKind } from "../../types/support";
import { EditIconButton } from "../admin/AdminUi";
import { LoadingImage } from "../ui/Loaders";
import type { CurrentArtwork } from "../../types/currentSite";
import { ArtworkDimensions } from "./ArtworkDimensions";

type ArtworkShowcaseListProps = {
  artworks: CurrentArtwork[];
  isEditing?: boolean;
  onAdd?: () => void;
  onDelete?: (artwork: CurrentArtwork) => void;
  onEdit?: (artwork: CurrentArtwork) => void;
  onToggleVisibility?: (artwork: CurrentArtwork) => void;
  supportKind?: SupportKind;
};

export function ArtworkShowcaseList({ artworks, isEditing = false, onAdd, onDelete, onEdit, onToggleVisibility }: ArtworkShowcaseListProps) {
  const { labels } = useSitePreferences();
  const mockupTitleId = useId();
  const mockupDescriptionId = useId();
  const mockupDialogRef = useRef<HTMLDivElement | null>(null);
  const [activeArtwork, setActiveArtwork] = useState<CurrentArtwork | null>(null);
  const [activeMockupArtwork, setActiveMockupArtwork] = useState<CurrentArtwork | null>(null);
  const [activeMockupIndex, setActiveMockupIndex] = useState(0);
  const [lensPosition, setLensPosition] = useState({ x: 50, y: 50 });
  const [isLensVisible, setIsLensVisible] = useState(false);
  const mockupGalleryRef = useRef<HTMLDivElement | null>(null);
  const mockupScrollUnlockRef = useRef<number | null>(null);
  const activeMockups = useMemo(
    () => (activeMockupArtwork ? getMockupsForArtwork(activeMockupArtwork, roomScenes) : []),
    [activeMockupArtwork],
  );
  const hasMockupNavigation = activeMockups.length > 1;
  const hasKnownMockupDimensions = activeMockupArtwork !== null && getArtworkMetrics(activeMockupArtwork).widthCm !== null;

  useEffect(() => {
    if (!activeMockupArtwork) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = mockupDialogRef.current;
    dialog?.querySelector<HTMLButtonElement>(".artwork-lightbox__close")?.focus();
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    dialog?.addEventListener("keydown", trapFocus);
    return () => {
      dialog?.removeEventListener("keydown", trapFocus);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [activeMockupArtwork]);

  useEffect(() => {
    if (!activeArtwork && !activeMockupArtwork) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveArtwork(null);
        setActiveMockupArtwork(null);
      }
    }

    document.documentElement.classList.add("is-lightbox-open");
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.classList.remove("is-lightbox-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeArtwork, activeMockupArtwork]);

  useEffect(() => {
    if (!activeMockupArtwork) return;

    if (mockupScrollUnlockRef.current !== null) {
      window.clearTimeout(mockupScrollUnlockRef.current);
      mockupScrollUnlockRef.current = null;
    }

    setActiveMockupIndex(0);
    requestAnimationFrame(() => {
      mockupGalleryRef.current?.scrollTo({ left: 0, behavior: "auto" });
    });
  }, [activeMockupArtwork?.id]);

  useEffect(
    () => () => {
      if (mockupScrollUnlockRef.current !== null) {
        window.clearTimeout(mockupScrollUnlockRef.current);
      }
    },
    [],
  );

  function openArtwork(artwork: CurrentArtwork) {
    setLensPosition({ x: 50, y: 50 });
    setIsLensVisible(false);
    setActiveArtwork(artwork);
  }

  function openMockups(artwork: CurrentArtwork) {
    setActiveMockupIndex(0);
    setActiveMockupArtwork(artwork);
  }

  function scrollMockupIntoView(index: number) {
    const gallery = mockupGalleryRef.current;
    const target = gallery?.querySelectorAll<HTMLElement>(".room-mockup-card")[index];

    if (!gallery || !target) return;

    gallery.scrollTo({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      left: target.offsetLeft - (gallery.clientWidth - target.offsetWidth) / 2,
    });
  }

  function showMockup(index: number) {
    if (activeMockups.length === 0) return;

    const nextIndex = clamp(Math.round(index), 0, activeMockups.length - 1);

    if (mockupScrollUnlockRef.current !== null) {
      window.clearTimeout(mockupScrollUnlockRef.current);
    }

    setActiveMockupIndex(nextIndex);
    requestAnimationFrame(() => {
      scrollMockupIntoView(nextIndex);
      mockupScrollUnlockRef.current = window.setTimeout(() => {
        mockupScrollUnlockRef.current = null;
        if (mockupGalleryRef.current) {
          setActiveMockupIndex(getClosestGalleryIndex(mockupGalleryRef.current));
        }
      }, 620);
    });
  }

  function handleMockupGalleryScroll(event: UIEvent<HTMLDivElement>) {
    if (mockupScrollUnlockRef.current !== null) return;

    const nextIndex = getClosestGalleryIndex(event.currentTarget);
    setActiveMockupIndex((currentIndex) => (currentIndex === nextIndex ? currentIndex : nextIndex));
  }

  function handleMockupGalleryKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!hasMockupNavigation) return;

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showMockup(activeMockupIndex - 1);
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showMockup(activeMockupIndex + 1);
    }
  }

  return (
    <>
      <div className="artwork-showcase-list">
        {isEditing && onAdd ? (
          <button
            type="button"
            className="artwork-showcase artwork-showcase--add"
            onClick={onAdd}
            aria-label="Añadir obra"
            title="Añadir obra"
          >
            <span className="artwork-showcase__add-surface editor-add-card">
              <ImagePlus aria-hidden="true" />
            </span>
          </button>
        ) : null}
        {artworks.map((artwork) => (
          <ArtworkShowcase
            key={artwork.id}
            artwork={artwork}
            labels={labels}
            isEditing={isEditing}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleVisibility={onToggleVisibility}
            onImageSelect={openArtwork}
            onMockupsSelect={openMockups}
          />
        ))}
      </div>

      {activeArtwork ? (
        <div className="artwork-lightbox" role="dialog" aria-modal="true" onClick={() => setActiveArtwork(null)}>
          <LightboxCloseButton label={labels.actions.closeImage} onClick={() => setActiveArtwork(null)} />
          <div
            className="artwork-lightbox__stage"
            onClick={(event) => event.stopPropagation()}
            onPointerEnter={() => setIsLensVisible(true)}
            onPointerLeave={() => setIsLensVisible(false)}
            onPointerMove={(event) => updateLensPosition(event, setLensPosition)}
          >
            <LoadingImage src={activeArtwork.imageUrl} alt={activeArtwork.title} />
            <span
              className={`artwork-lightbox__lens${isLensVisible ? " is-visible" : ""}`}
              style={getLensStyle(activeArtwork, lensPosition)}
              aria-hidden="true"
            />
          </div>
          <div className="artwork-lightbox__caption" onClick={(event) => event.stopPropagation()}>
            <h2>{activeArtwork.title}</h2>
            {activeArtwork.technique ? <p>{activeArtwork.technique}</p> : null}
            {activeArtwork.dimensions ? <ArtworkDimensions value={activeArtwork.dimensions} /> : null}
            <ArtworkEditorialText artwork={activeArtwork} />
          </div>
        </div>
      ) : null}

      {activeMockupArtwork ? (
        <div ref={mockupDialogRef} className="artwork-mockup-lightbox" role="dialog" aria-modal="true" aria-labelledby={mockupTitleId} aria-describedby={mockupDescriptionId} onClick={() => setActiveMockupArtwork(null)}>
          <LightboxCloseButton label={labels.actions.closeMockups} onClick={() => setActiveMockupArtwork(null)} />
          <div className="artwork-mockup-lightbox__inner" onClick={(event) => event.stopPropagation()}>
            <div className="artwork-mockup-lightbox__heading">
              <span>{labels.actions.mockups}</span>
              <h2 id={mockupTitleId}>{activeMockupArtwork.title}</h2>
              {activeMockupArtwork.dimensions ? <ArtworkDimensions value={activeMockupArtwork.dimensions} /> : null}
            </div>
            <div className="artwork-mockup-carousel">
              {hasMockupNavigation ? (
                <MockupNavButton
                  direction="prev"
                  disabled={activeMockupIndex === 0}
                  label={labels.actions.mockupPrevious}
                  onClick={() => showMockup(activeMockupIndex - 1)}
                />
              ) : null}
              <div
                ref={mockupGalleryRef}
                className="artwork-mockup-gallery"
                onKeyDown={handleMockupGalleryKeyDown}
                onScroll={handleMockupGalleryScroll}
                onWheel={handleMockupGalleryWheel}
                aria-label={`${labels.actions.mockupsFor} ${activeMockupArtwork.title}`}
                tabIndex={0}
              >
                {activeMockups.length === 0 ? <p className="artwork-mockup-empty">{labels.actions.noFittingRoom}</p> : null}
                {activeMockups.map((mockup, index) => (
                  <RoomMockup
                    key={mockup.id}
                    artwork={activeMockupArtwork}
                    template={mockup}
                    label={labels.rooms[mockup.labelKey]}
                    backgroundUrl={mockup.backgroundUrl}
                    isActive={index === activeMockupIndex}
                  />
                ))}
              </div>
              {hasMockupNavigation ? (
                <MockupNavButton
                  direction="next"
                  disabled={activeMockupIndex === activeMockups.length - 1}
                  label={labels.actions.mockupNext}
                  onClick={() => showMockup(activeMockupIndex + 1)}
                />
              ) : null}
            </div>
            <div className="artwork-mockup-lightbox__footer">
              {hasMockupNavigation ? (
                <div className="artwork-mockup-pagination" aria-label={labels.actions.mockupSelector}>
                  {activeMockups.map((mockup, index) => (
                    <button
                      key={mockup.id}
                      type="button"
                      className={`artwork-mockup-pagination__dot${index === activeMockupIndex ? " is-active" : ""}`}
                      aria-label={`${labels.actions.viewMockup} ${index + 1}: ${labels.rooms[mockup.labelKey]}`}
                      aria-current={index === activeMockupIndex ? "true" : undefined}
                      onClick={() => showMockup(index)}
                    />
                  ))}
                </div>
              ) : null}
              <p id={mockupDescriptionId} className="artwork-mockup-lightbox__scale">
                {hasKnownMockupDimensions ? labels.actions.roomScaleNote : labels.actions.roomScaleUnknown}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LightboxCloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="artwork-lightbox__close" aria-label={label} onClick={onClick}>
      <span>{label}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
      </svg>
    </button>
  );
}

function MockupNavButton({
  direction,
  disabled,
  label,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`artwork-mockup-nav artwork-mockup-nav--${direction}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {direction === "prev" ? <path d="m15 5-7 7 7 7" /> : <path d="m9 5 7 7-7 7" />}
      </svg>
    </button>
  );
}

function ArtworkShowcase({
  artwork,
  isEditing,
  labels,
  onEdit,
  onDelete,
  onToggleVisibility,
  onImageSelect,
  onMockupsSelect,
}: {
  artwork: CurrentArtwork;
  isEditing: boolean;
  labels: SiteLabels;
  onEdit?: (artwork: CurrentArtwork) => void;
  onDelete?: (artwork: CurrentArtwork) => void;
  onToggleVisibility?: (artwork: CurrentArtwork) => void;
  onImageSelect: (artwork: CurrentArtwork) => void;
  onMockupsSelect: (artwork: CurrentArtwork) => void;
}) {
  const { openArtworkContact } = useContactDialog();

  return (
    <article className={`artwork-showcase${!artwork.isPublished ? " is-unpublished" : ""}`} id={artwork.slug}>
      <div className="artwork-showcase__content" style={getArtworkPresentationStyle(artwork)}>
        <figure className="artwork-showcase__figure editor-media-target">
        <button
          type="button"
          className="artwork-showcase__zoom-button"
          onClick={() => onImageSelect(artwork)}
          aria-label={`${labels.actions.viewFullscreen}: ${artwork.title}`}
        >
          <LoadingImage src={artwork.imageUrl} alt={artwork.title} loading="lazy" />
        </button>
        {isEditing && (onEdit || onDelete || onToggleVisibility) ? (
          <>
            {onEdit ? (
              <EditIconButton
                className="editor-media-target__action editor-media-target__action--edit"
                label={`Editar obra: ${artwork.title}`}
                onClick={() => onEdit(artwork)}
              >
                <Pencil aria-hidden="true" />
              </EditIconButton>
            ) : null}
            {onDelete ? (
              <EditIconButton
                className="editor-media-target__action editor-media-target__action--danger"
                label={`Eliminar obra: ${artwork.title}`}
                tone="danger"
                onClick={() => onDelete(artwork)}
              >
                <Trash2 aria-hidden="true" />
              </EditIconButton>
            ) : null}
            {onToggleVisibility ? (
              <EditIconButton
                className="editor-media-target__action editor-media-target__action--visibility"
                label={artwork.isPublished ? `Ocultar obra: ${artwork.title}` : `Mostrar obra: ${artwork.title}`}
                onClick={() => onToggleVisibility(artwork)}
              >
                {artwork.isPublished ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
              </EditIconButton>
            ) : null}
          </>
        ) : null}
        </figure>
        <div className="artwork-showcase__meta">
        {!artwork.isPublished ? <span className="artwork-showcase__visibility-label">Oculta al público</span> : null}
        <h2>{artwork.title}</h2>
        {artwork.technique ? <p>{artwork.technique}</p> : null}
        {artwork.dimensions ? <ArtworkDimensions value={artwork.dimensions} /> : null}
        <ArtworkEditorialText artwork={artwork} />
        <div className="artwork-showcase__actions">
          <button
            type="button"
            className="artwork-ambient-button"
            onClick={() => onMockupsSelect(artwork)}
            aria-label={`${labels.actions.viewArtworkInRooms}: ${artwork.title}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 8.5h10.5v7H5z" />
              <path d="M8.5 5H19v7" />
              <path d="m6.8 14.2 2.5-2.8 2 2.1 1.4-1.5 1.8 2.2" />
            </svg>
            <span>{labels.actions.mockups}</span>
          </button>
          <button type="button" className="artwork-interest-button" onClick={() => openArtworkContact(artwork)}>
            {labels.actions.interest}
          </button>
        </div>
        </div>
      </div>
    </article>
  );
}

function ArtworkEditorialText({ artwork }: { artwork: CurrentArtwork }) {
  const { caption, description } = getArtworkEditorialText(artwork);
  if (!caption && !description) return null;

  return (
    <div className="artwork-editorial">
      {caption ? <p className="artwork-editorial__caption">{caption}</p> : null}
      {description ? <p className="artwork-editorial__description">{description}</p> : null}
    </div>
  );
}

function getArtworkPresentationStyle(artwork: CurrentArtwork): CSSProperties {
  const ratio = artwork.width && artwork.height
    ? artwork.width / artwork.height
    : getArtworkMetrics(artwork).ratio;

  return {
    "--artwork-aspect-ratio": `${clamp(ratio, 0.25, 4)}`,
    "--artwork-display-width": `${Math.min(129, 66 * ratio)}svh`,
    "--artwork-display-width-mobile": `${Math.min(86, 48 * ratio)}svh`,
  } as CSSProperties;
}

function RoomMockup({
  artwork,
  template,
  label,
  backgroundUrl,
  isActive,
}: {
  artwork: CurrentArtwork;
  template: ArtworkRoomScene;
  label: string;
  backgroundUrl: string;
  isActive: boolean;
}) {

  return (
    <article
      className={`room-mockup-card${isActive ? " is-active" : ""}`}
      data-room-id={template.id}
      aria-label={label}
      style={getMockupStyle(artwork, template)}
    >
      <LoadingImage className="room-mockup-card__background" src={backgroundUrl} alt="" loading={isActive ? "eager" : "lazy"} aria-hidden="true" />
      <span className="room-mockup-card__artwork">
        <span className="room-mockup-card__artwork-surface">
          <LoadingImage src={artwork.imageUrl} alt={artwork.title} loading={isActive ? "eager" : "lazy"} />
        </span>
      </span>
      <span className="room-mockup-card__label">{label}</span>
    </article>
  );
}

function updateLensPosition(event: PointerEvent<HTMLDivElement>, setLensPosition: (position: { x: number; y: number }) => void) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
  const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

  setLensPosition({ x, y });
}

function getLensStyle(artwork: CurrentArtwork, position: { x: number; y: number }): CSSProperties {
  return {
    backgroundImage: `url("${artwork.imageUrl}")`,
    backgroundPosition: `${position.x}% ${position.y}%`,
    left: `${position.x}%`,
    top: `${position.y}%`,
  };
}

function getMockupStyle(artwork: CurrentArtwork, template: ArtworkRoomScene): CSSProperties {
  const placement = getArtworkPlacement(getArtworkMetrics(artwork), template);

  return {
    "--mockup-artwork-height": `${placement.height}%`,
    "--mockup-artwork-width": `${placement.width}%`,
    "--mockup-artwork-x": `${placement.x}%`,
    "--mockup-artwork-y": `${placement.y}%`,
    "--mockup-card-ratio": `${template.imageAspectRatio}`,
    "--mockup-artwork-brightness": `${template.brightness}`,
  } as CSSProperties;
}

function handleMockupGalleryWheel(event: WheelEvent<HTMLDivElement>) {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

  event.currentTarget.scrollLeft += event.deltaY;
  event.preventDefault();
}

function getClosestGalleryIndex(gallery: HTMLDivElement) {
  const cards = Array.from(gallery.querySelectorAll<HTMLElement>(".room-mockup-card"));
  const galleryCenter = gallery.scrollLeft + gallery.clientWidth / 2;

  if (cards.length === 0) return 0;

  return cards.reduce(
    (closestIndex, card, index) => {
      const closestCard = cards[closestIndex];
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const closestCenter = closestCard.offsetLeft + closestCard.offsetWidth / 2;

      return Math.abs(cardCenter - galleryCenter) < Math.abs(closestCenter - galleryCenter) ? index : closestIndex;
    },
    0,
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
