import { useMemo } from "react";
import { useEditableContent } from "../app/editableContent";
import { useSitePreferences } from "../app/sitePreferences";
import { SupportLandingGrid } from "../components/support/SupportLandingGrid";
import { PageLoader } from "../components/ui/Loaders";

export function WorksPage() {
  const { labels } = useSitePreferences();
  const { getSupportCollections, isLoading } = useEditableContent();
  const supportItems = useMemo(
    () =>
      (["canvas", "paper"] as const).map((kind) => {
        const groups = getSupportCollections(kind);
        const artworks = groups.flatMap((group) => group.artworks);

        return {
          kind,
          title: labels.support[kind],
          path: kind === "canvas" ? "/lienzos" : "/laminas",
          subtitle: "",
          coverImageUrl:
            (kind === "canvas" ? artworks.find((artwork) => artwork.slug === "el-mar-de-ulises")?.imageUrl : null) ??
            artworks[0]?.imageUrl ??
            groups[0]?.coverImageUrl ??
            null,
          count: artworks.length,
        };
      }),
    [getSupportCollections, labels],
  );

  return (
    <section className="page-section portfolio-entry-section">
      {isLoading ? <PageLoader variant="landing" /> : <SupportLandingGrid items={supportItems} />}
    </section>
  );
}
