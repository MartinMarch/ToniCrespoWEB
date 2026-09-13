import { AlertTriangle, ChevronDown, Pencil } from "lucide-react";
import { getArtworkReviewIssues } from "../../lib/artworkReview";
import type { CurrentArtwork } from "../../types/currentSite";

export function CollectionReviewBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return <span className="content-review-badge"><AlertTriangle aria-hidden="true" /><span>{count} {count === 1 ? "obra por revisar" : "obras por revisar"}</span></span>;
}

export function ArtworkReviewBadge({ artwork }: { artwork: CurrentArtwork }) {
  if (!getArtworkReviewIssues(artwork).length) return null;
  return <span className="content-review-badge"><AlertTriangle aria-hidden="true" /><span>Revisar ficha</span></span>;
}

/** Native details works with touch and keyboard without making the card draggable. */
export function ArtworkReviewNotice({ artwork, expanded = false, disabled = false, onEdit }: {
  artwork: CurrentArtwork;
  expanded?: boolean;
  disabled?: boolean;
  onEdit?: () => void;
}) {
  const issues = getArtworkReviewIssues(artwork);
  if (!issues.length) return null;
  const reasons = <ul className="content-review-reasons">{issues.map((issue) => <li key={issue.field}>{issue.message}</li>)}</ul>;

  if (expanded) return <section className="content-review-notice" aria-label="Datos de la obra por revisar">
    <strong className="content-review-heading"><AlertTriangle aria-hidden="true" />Revisar ficha</strong>
    {reasons}
    <p>Este aviso es solo para administración; no oculta la obra ni impide publicarla.</p>
  </section>;

  return <details className="content-review-details" onToggle={(event) => {
    if (event.currentTarget.open) event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
  }}>
    <summary><AlertTriangle aria-hidden="true" /><span>Revisar ficha</span><ChevronDown className="content-review-chevron" aria-hidden="true" /></summary>
    {reasons}
    {onEdit ? <button type="button" disabled={disabled} onClick={onEdit}><Pencil aria-hidden="true" />Editar ficha</button> : null}
  </details>;
}
