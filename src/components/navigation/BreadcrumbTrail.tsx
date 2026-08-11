import { Link } from "react-router-dom";
import { useSitePreferences } from "../../app/sitePreferences";

type BreadcrumbTrailItem = {
  label: string;
  path?: string;
};

type BreadcrumbTrailProps = {
  items: BreadcrumbTrailItem[];
};

export function BreadcrumbTrail({ items }: BreadcrumbTrailProps) {
  const { labels } = useSitePreferences();

  return (
    <nav className="breadcrumb-trail" aria-label={labels.aria.breadcrumb}>
      <ol>
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`}>
              {item.path && !isCurrent ? (
                <Link to={item.path}>{item.label}</Link>
              ) : (
                <span aria-current={isCurrent ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
