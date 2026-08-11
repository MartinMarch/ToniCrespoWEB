import { Link, useParams } from "react-router-dom";
import { useEditableContent } from "../app/editableContent";
import { useSitePreferences } from "../app/sitePreferences";
import { ArtworkShowcaseList } from "../components/artworks/ArtworkShowcaseList";
import { BreadcrumbTrail } from "../components/navigation/BreadcrumbTrail";
import { PageLoader } from "../components/ui/Loaders";

export function CollectionDetailPage() {
  const { labels } = useSitePreferences();
  const { collections, isLoading } = useEditableContent();
  const { collectionSlug } = useParams();
  const collection = collectionSlug ? collections.find((item) => item.slug === collectionSlug && item.isPublished) ?? null : null;

  if (isLoading) {
    return (
      <section className="page-section support-detail-page">
        <PageLoader variant="grid" />
      </section>
    );
  }

  if (!collection) {
    return (
      <section className="page-section narrow">
        <h1>{labels.status.collectionNotFound}</h1>
        <Link to="/obra">{labels.actions.backToWork}</Link>
      </section>
    );
  }

  return (
    <section className="page-section support-detail-page">
      <div className="support-detail-heading">
        <BreadcrumbTrail items={[{ label: labels.nav.work, path: "/obra" }, { label: collection.title }]} />
        <h1>{collection.title}</h1>
      </div>
      {collection.artworks.length > 0 ? (
        <ArtworkShowcaseList artworks={collection.artworks} />
      ) : (
        <p className="empty-state">{labels.status.noImages}</p>
      )}
    </section>
  );
}
