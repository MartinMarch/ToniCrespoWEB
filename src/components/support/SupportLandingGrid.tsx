import { Link } from "react-router-dom";
import { LoadingImage } from "../ui/Loaders";
import type { SupportKind } from "../../types/support";

export type SupportLandingItem = {
  kind: SupportKind;
  title: string;
  path: string;
  subtitle: string;
  coverImageUrl: string | null;
  count: number;
};

type SupportLandingGridProps = {
  items: SupportLandingItem[];
};

export function SupportLandingGrid({ items }: SupportLandingGridProps) {
  return (
    <div className="support-landing-grid">
      {items.map((item) => (
        <Link key={item.kind} className="support-landing-card" to={item.path}>
          <span className="support-landing-card__image">
            {item.coverImageUrl ? <LoadingImage src={item.coverImageUrl} alt={item.title} loading="eager" /> : null}
          </span>
          <span className="support-landing-card__text">
            <span className="support-landing-card__title">{item.title}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
