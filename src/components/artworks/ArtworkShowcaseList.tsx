import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent,
} from "react";
import { ImagePlus, Pencil, Trash2 } from "lucide-react";
import { useContactDialog } from "../contact/ContactDialogProvider";
import { useSitePreferences, type SiteLabels } from "../../app/sitePreferences";
import { getSupabasePublicStorageUrl } from "../../lib/supabaseClient";
import type { SupportKind } from "../../types/support";
import { EditIconButton } from "../admin/AdminUi";
import { LoadingImage } from "../ui/Loaders";
import type { CurrentArtwork } from "../../types/currentSite";

type ArtworkShowcaseListProps = {
  artworks: CurrentArtwork[];
  isEditing?: boolean;
  onAdd?: () => void;
  onDelete?: (artwork: CurrentArtwork) => void;
  onEdit?: (artwork: CurrentArtwork) => void;
  supportKind?: SupportKind;
};

type RoomMockupTemplate = {
  id: string;
  labelKey: keyof SiteLabels["rooms"];
  backgroundUrl: string;
  cardRatio: string;
  tone: "cool" | "neutral" | "warm" | "dark";
  preferredLongestCm: {
    min: number;
    max: number;
  };
  wall: {
    x: number;
    y: number;
    width: number;
    height: number;
    widthCm: number;
    heightCm: number;
  };
};

const roomMockups: readonly RoomMockupTemplate[] = [
  {
    id: "small-print-studio",
    labelKey: "studio",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/small-print-wall-v3.jpg"),
    cardRatio: "3 / 2",
    tone: "warm",
    preferredLongestCm: { min: 0, max: 65 },
    wall: { x: 50, y: 5, width: 52, height: 69, widthCm: 90, heightCm: 80 },
  },
  {
    id: "small-print-walnut-alcove",
    labelKey: "walnutAlcove",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/small-print-cabinet-v1.jpg"),
    cardRatio: "3 / 2",
    tone: "warm",
    preferredLongestCm: { min: 0, max: 65 },
    wall: { x: 50, y: 6, width: 54, height: 66, widthCm: 95, heightCm: 82 },
  },
  {
    id: "small-print-bedroom",
    labelKey: "bedroom",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/small-print-bedroom-bench-v1.jpg"),
    cardRatio: "3 / 2",
    tone: "warm",
    preferredLongestCm: { min: 0, max: 65 },
    wall: { x: 50, y: 6, width: 58, height: 65, widthCm: 100, heightCm: 82 },
  },
  {
    id: "medium-canvas-living-room",
    labelKey: "livingRoom",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/medium-canvas-wall-v2.jpg"),
    cardRatio: "3 / 2",
    tone: "neutral",
    preferredLongestCm: { min: 66, max: 160 },
    wall: { x: 50, y: 6, width: 61, height: 55, widthCm: 240, heightCm: 144 },
  },
  {
    id: "medium-canvas-linen-room",
    labelKey: "linenRoom",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/medium-canvas-sofa-v1.jpg"),
    cardRatio: "3 / 2",
    tone: "neutral",
    preferredLongestCm: { min: 66, max: 160 },
    wall: { x: 50, y: 5, width: 72, height: 61, widthCm: 270, heightCm: 160 },
  },
  {
    id: "medium-canvas-walnut-sideboard",
    labelKey: "walnutGallery",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/medium-canvas-sideboard-v1.jpg"),
    cardRatio: "3 / 2",
    tone: "warm",
    preferredLongestCm: { min: 66, max: 160 },
    wall: { x: 50, y: 4, width: 73, height: 66, widthCm: 250, heightCm: 160 },
  },
  {
    id: "wide-diptych-travertine-room",
    labelKey: "travertineRoom",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/wide-diptych-wall-v2.jpg"),
    cardRatio: "3 / 2",
    tone: "dark",
    preferredLongestCm: { min: 160, max: 260 },
    wall: { x: 50, y: 10, width: 75, height: 52, widthCm: 360, heightCm: 168 },
  },
  {
    id: "wide-diptych-limestone-gallery",
    labelKey: "limestoneGallery",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/wide-diptych-limestone-bench-v1.jpg"),
    cardRatio: "3 / 2",
    tone: "dark",
    preferredLongestCm: { min: 160, max: 260 },
    wall: { x: 50, y: 7, width: 78, height: 58, widthCm: 430, heightCm: 175 },
  },
  {
    id: "wide-diptych-oak-gallery",
    labelKey: "oakGallery",
    backgroundUrl: getSupabasePublicStorageUrl("site-assets", "legacy/mockups/generated/wide-diptych-oak-bench-v1.jpg"),
    cardRatio: "3 / 2",
    tone: "dark",
    preferredLongestCm: { min: 160, max: 260 },
    wall: { x: 50, y: 6, width: 80, height: 61, widthCm: 430, heightCm: 170 },
  },
] as const;

export function ArtworkShowcaseList({ artworks, isEditing = false, onAdd, onDelete, onEdit, supportKind }: ArtworkShowcaseListProps) {
  const { labels } = useSitePreferences();
  const [activeArtwork, setActiveArtwork] = useState<CurrentArtwork | null>(null);
  const [activeMockupArtwork, setActiveMockupArtwork] = useState<CurrentArtwork | null>(null);
  const [activeMockupIndex, setActiveMockupIndex] = useState(0);
  const [lensPosition, setLensPosition] = useState({ x: 50, y: 50 });
  const [isLensVisible, setIsLensVisible] = useState(false);
  const mockupGalleryRef = useRef<HTMLDivElement | null>(null);
  const mockupScrollUnlockRef = useRef<number | null>(null);
  const activeMockups = useMemo(
    () => (activeMockupArtwork ? getMockupsForArtwork(activeMockupArtwork) : []),
    [activeMockupArtwork],
  );
  const hasMockupNavigation = activeMockups.length > 1;

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
      behavior: "smooth",
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
          <div className="artwork-lightbox__caption">
            <h2>{activeArtwork.title}</h2>
            {activeArtwork.technique ? <p>{activeArtwork.technique}</p> : null}
            {activeArtwork.dimensions ? <p>{activeArtwork.dimensions}</p> : null}
          </div>
        </div>
      ) : null}

      {activeMockupArtwork ? (
        <div className="artwork-mockup-lightbox" role="dialog" aria-modal="true" onClick={() => setActiveMockupArtwork(null)}>
          <LightboxCloseButton label={labels.actions.closeMockups} onClick={() => setActiveMockupArtwork(null)} />
          <div className="artwork-mockup-lightbox__inner" onClick={(event) => event.stopPropagation()}>
            <div className="artwork-mockup-lightbox__heading">
              <span>{labels.actions.mockups}</span>
              <h2>{activeMockupArtwork.title}</h2>
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
                {activeMockups.map((mockup, index) => (
                  <RoomMockup
                    key={mockup.id}
                    artwork={activeMockupArtwork}
                    template={mockup}
                    label={labels.rooms[mockup.labelKey]}
                    backgroundUrl={mockup.backgroundUrl}
                    isActive={index === activeMockupIndex}
                    supportKind={supportKind}
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
  onImageSelect,
  onMockupsSelect,
}: {
  artwork: CurrentArtwork;
  isEditing: boolean;
  labels: SiteLabels;
  onEdit?: (artwork: CurrentArtwork) => void;
  onDelete?: (artwork: CurrentArtwork) => void;
  onImageSelect: (artwork: CurrentArtwork) => void;
  onMockupsSelect: (artwork: CurrentArtwork) => void;
}) {
  const { openArtworkContact } = useContactDialog();
  const caption = artwork.caption.trim();
  const shouldShowCaption =
    !artwork.technique && !artwork.dimensions && caption && caption.toLowerCase() !== artwork.title.toLowerCase();

  return (
    <article className="artwork-showcase" id={artwork.slug}>
      <figure className="artwork-showcase__figure editor-media-target">
        <button
          type="button"
          className="artwork-showcase__zoom-button"
          onClick={() => onImageSelect(artwork)}
          aria-label={`${labels.actions.viewFullscreen}: ${artwork.title}`}
        >
          <LoadingImage src={artwork.imageUrl} alt={artwork.title} loading="lazy" />
        </button>
        {isEditing && (onEdit || onDelete) ? (
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
          </>
        ) : null}
      </figure>
      <div className="artwork-showcase__meta">
        <h2>{artwork.title}</h2>
        {artwork.technique ? <p>{artwork.technique}</p> : null}
        {artwork.dimensions ? <p>{artwork.dimensions}</p> : null}
        {shouldShowCaption ? <p>{caption}</p> : null}
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
    </article>
  );
}

function RoomMockup({
  artwork,
  template,
  label,
  backgroundUrl,
  isActive,
  supportKind,
}: {
  artwork: CurrentArtwork;
  template: RoomMockupTemplate;
  label: string;
  backgroundUrl: string;
  isActive: boolean;
  supportKind?: SupportKind;
}) {
  const presentation = supportKind === "paper" || isPaperArtwork(artwork) ? "framed" : "canvas";

  return (
    <article
      className={`room-mockup-card room-mockup-card--${presentation} room-mockup-card--${template.tone}${
        isActive ? " is-active" : ""
      }`}
      style={getMockupStyle(artwork, template)}
    >
      <LoadingImage className="room-mockup-card__background" src={backgroundUrl} alt="" loading="lazy" aria-hidden="true" />
      <span className="room-mockup-card__artwork">
        <span className="room-mockup-card__frame">
          <span className="room-mockup-card__artwork-surface">
            <LoadingImage src={artwork.imageUrl} alt={artwork.title} loading="lazy" />
          </span>
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

function getMockupsForArtwork(artwork: CurrentArtwork) {
  const metrics = getArtworkMetrics(artwork);
  const longestCm = metrics.longestCm;
  const sizeMatchedMockups = longestCm
    ? roomMockups.filter(
        (mockup) =>
          longestCm >= mockup.preferredLongestCm.min && longestCm <= mockup.preferredLongestCm.max,
      )
    : [];
  const candidates = sizeMatchedMockups.length > 0 ? sizeMatchedMockups : roomMockups;

  return [...candidates]
    .map((mockup) => ({
      mockup,
      score:
        getRatioScore(metrics.ratio, getWallRatio(mockup)) +
        getSizePreferenceScore(metrics.longestCm, mockup.preferredLongestCm),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map(({ mockup }) => mockup);
}

function getMockupStyle(artwork: CurrentArtwork, template: RoomMockupTemplate): CSSProperties {
  const metrics = getArtworkMetrics(artwork);
  const placement = getArtworkPlacement(metrics, template);

  return {
    "--mockup-artwork-height": `${placement.height}%`,
    "--mockup-artwork-width": `${placement.width}%`,
    "--mockup-artwork-x": `${placement.x}%`,
    "--mockup-artwork-y": `${placement.y}%`,
    "--mockup-card-ratio": template.cardRatio,
    "--mockup-card-width-factor": `${getCardRatio(template.cardRatio)}`,
  } as CSSProperties;
}

function getArtworkMetrics(artwork: CurrentArtwork) {
  const physicalDimensions = parsePhysicalDimensions(artwork.dimensions || artwork.description || artwork.caption);
  const pixelRatio = artwork.width && artwork.height ? artwork.width / artwork.height : 1;
  const physicalRatio = physicalDimensions ? physicalDimensions.width / physicalDimensions.height : null;
  const reversedPhysicalRatio = physicalDimensions ? physicalDimensions.height / physicalDimensions.width : null;
  const shouldUseReversedPhysicalRatio =
    physicalRatio &&
    reversedPhysicalRatio &&
    getRatioScore(reversedPhysicalRatio, pixelRatio) < getRatioScore(physicalRatio, pixelRatio);
  const dimensions = physicalDimensions
    ? shouldUseReversedPhysicalRatio
      ? { width: physicalDimensions.height, height: physicalDimensions.width }
      : physicalDimensions
    : null;
  const ratio = dimensions ? dimensions.width / dimensions.height : pixelRatio;

  return {
    ratio,
    widthCm: dimensions?.width ?? null,
    heightCm: dimensions?.height ?? null,
    longestCm: dimensions ? Math.max(dimensions.width, dimensions.height) : null,
  };
}

function parsePhysicalDimensions(value: string | null) {
  if (!value) return null;

  const match = value
    .replace(/,/g, ".")
    .match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);

  if (!match) return null;

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function getArtworkPlacement(
  metrics: ReturnType<typeof getArtworkMetrics>,
  template: RoomMockupTemplate,
) {
  if (metrics.widthCm !== null && metrics.heightCm !== null) {
    const requestedWidth = template.wall.width * (metrics.widthCm / template.wall.widthCm);
    const requestedHeight = template.wall.height * (metrics.heightCm / template.wall.heightCm);
    const fitScale = Math.min(
      1,
      (template.wall.width * 0.94) / requestedWidth,
      (template.wall.height * 0.94) / requestedHeight,
    );
    const width = requestedWidth * fitScale;
    const height = requestedHeight * fitScale;

    return {
      x: template.wall.x,
      y: template.wall.y + (template.wall.height - height) / 2,
      width,
      height,
    };
  }

  const cardRatio = getCardRatio(template.cardRatio);
  const scale = getArtworkScale(metrics.longestCm);
  const availableWidth = (template.wall.width / 100) * scale;
  const availableHeight = ((template.wall.height / 100) * scale) / cardRatio;
  const artworkWidth = Math.min(availableWidth, availableHeight * metrics.ratio);
  const artworkHeight = artworkWidth / metrics.ratio;
  const width = artworkWidth * 100;
  const height = artworkHeight * cardRatio * 100;

  return {
    x: template.wall.x,
    y: template.wall.y + (template.wall.height - height) / 2,
    width,
    height,
  };
}

function getSizePreferenceScore(
  longestCm: number | null,
  range: RoomMockupTemplate["preferredLongestCm"],
) {
  if (!longestCm) return 0;

  const midpoint = (range.min + range.max) / 2;
  return Math.abs(longestCm - midpoint) / Math.max(range.max - range.min, 1);
}

function getArtworkScale(longestCm: number | null) {
  if (!longestCm) return 0.79;

  return clamp(0.57 + longestCm / 340, 0.62, 0.94);
}

function getWallRatio(template: RoomMockupTemplate) {
  return getCardRatio(template.cardRatio) * (template.wall.width / template.wall.height);
}

function isPaperArtwork(artwork: CurrentArtwork) {
  const searchable = [artwork.collectionSlug, artwork.technique, artwork.caption, artwork.description]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return searchable.includes("papel") || searchable.includes("lamina");
}

function getCardRatio(cardRatio: string) {
  const [widthPart, heightPart] = cardRatio.split("/").map((part) => Number(part.trim()));

  return widthPart / heightPart;
}

function getRatioScore(artworkRatio: number, openingRatio: number) {
  return Math.abs(Math.log(artworkRatio / openingRatio));
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
