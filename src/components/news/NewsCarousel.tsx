import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSitePreferences } from "../../app/sitePreferences";
import { newsCopy } from "../../lib/newsPresentation";
import type { NewsImage } from "../../types/domain";
import { LoadingImage } from "../ui/Loaders";

export function NewsCarousel({ images, title, onImageSelect }: {
  images: NewsImage[];
  title: string;
  onImageSelect: (image: NewsImage) => void;
}) {
  const { language } = useSitePreferences();
  const copy = newsCopy[language];
  const track = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const [ratio, setRatio] = useState(1);
  const currentIndex = useRef(0);
  const pointerStart = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const count = images.length;
  const signature = images.map(image => image.url).join("\n");

  useEffect(() => {
    currentIndex.current = 0;
    setActiveIndex(0);
    setRatio(1);
    track.current?.scrollTo({ left: 0, behavior: "instant" });
  }, [signature]);

  useEffect(() => {
    const element = track.current;
    if (!element) return;
    // Retain the same image after rotation or resizing, not a half-visible slide.
    let previousWidth = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (previousWidth === element.clientWidth) return;
      previousWidth = element.clientWidth;
      element.scrollTo({ left: currentIndex.current * previousWidth, behavior: "instant" });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [count]);

  function goTo(index: number) {
    const next = Math.max(0, Math.min(index, count - 1));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: reduceMotion ? "instant" : "smooth" });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.key === "ArrowRight" ? activeIndex + 1 : event.key === "ArrowLeft" ? activeIndex - 1 : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (target === null) return;
    event.preventDefault();
    goTo(target);
  }

  if (!count) return null;
  const dotStart = Math.max(0, Math.min(activeIndex - 3, count - 7));
  const dots = Array.from({ length: Math.min(count, 7) }, (_, offset) => offset + dotStart);

  return (
    <div className="news-carousel" role="region" aria-roledescription={copy.gallery} aria-label={`${copy.images} ${title}`}>
      <div className="news-carousel__viewport" style={{ "--news-media-ratio": ratio } as CSSProperties}>
        <div
          className="news-carousel__track" id={trackId} ref={track} tabIndex={count > 1 ? 0 : undefined}
          aria-label={copy.gallery} onKeyDown={handleKeyDown}
          onScroll={(event) => {
            const element = event.currentTarget;
            const index = Math.max(0, Math.min(count - 1, Math.round(element.scrollLeft / (element.clientWidth || 1))));
            currentIndex.current = index;
            setActiveIndex(index);
          }}
          onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; didDrag.current = false; }}
          onPointerMove={(event) => {
            if (Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y) > 8) didDrag.current = true;
          }}
          onPointerCancel={() => { didDrag.current = true; }}
        >
          {images.map((image, index) => (
            <figure className="news-carousel__slide" key={`${image.url}-${index}`} aria-label={`${index + 1} / ${count}`}>
              <button
                type="button" className="news-card__zoom-button" tabIndex={index === activeIndex ? 0 : -1}
                aria-label={`${copy.enlarge} ${index + 1} / ${count}: ${title}`}
                onClick={(event) => { if (event.detail === 0 || !didDrag.current) onImageSelect(image); }}
              >
                <LoadingImage src={image.url} alt={image.alt?.trim() || title} loading="lazy" draggable={false}
                  onLoad={(event) => {
                    if (index === 0 && event.currentTarget.naturalHeight) setRatio(Math.max(0.8, Math.min(1.91, event.currentTarget.naturalWidth / event.currentTarget.naturalHeight)));
                  }} />
              </button>
            </figure>
          ))}
        </div>
        {count > 1 ? <span className="news-carousel__counter" aria-hidden="true">{activeIndex + 1} / {count}</span> : null}
      </div>
      {count > 1 ? (
        <div className="news-carousel__controls">
          <button type="button" className="news-carousel__arrow" aria-label={copy.previous} aria-controls={trackId} disabled={activeIndex === 0} onClick={() => goTo(activeIndex - 1)}><ChevronLeft aria-hidden="true" /></button>
          <div className="news-carousel__dots">
            {dots.map(index => <button type="button" key={index} aria-label={`${copy.view} ${index + 1}`} aria-current={index === activeIndex ? "true" : undefined} aria-controls={trackId} onClick={() => goTo(index)}><span /></button>)}
          </div>
          <button type="button" className="news-carousel__arrow" aria-label={copy.next} aria-controls={trackId} disabled={activeIndex === count - 1} onClick={() => goTo(activeIndex + 1)}><ChevronRight aria-hidden="true" /></button>
          <span className="editor-visually-hidden" role="status">{copy.view} {activeIndex + 1} / {count}</span>
        </div>
      ) : null}
      {images[activeIndex]?.caption?.trim() ? <p className="news-carousel__caption">{images[activeIndex].caption}</p> : null}
    </div>
  );
}
