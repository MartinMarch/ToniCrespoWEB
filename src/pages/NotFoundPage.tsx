import { Link } from "react-router-dom";
import { useSitePreferences } from "../app/sitePreferences";

export function NotFoundPage() {
  const { labels } = useSitePreferences();

  return (
    <section className="page-section narrow">
      <p className="eyebrow">404</p>
      <h1>{labels.status.notFoundPage}</h1>
      <Link to="/">{labels.actions.backToHome}</Link>
    </section>
  );
}
