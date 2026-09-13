import { useMemo } from "react";
import { useEditablePage } from "../app/editableContent";
import { SupportLandingSection } from "../components/support/SupportLandingSection";
import { formatHomeStatementHtml } from "../lib/homeStatement";

export function HomePage() {
  const page = useEditablePage("home");
  const statementHtml = useMemo(() => formatHomeStatementHtml(page?.html ?? ""), [page?.html]);

  return (
    <>
      <SupportLandingSection />

      {page?.html ? (
        <section className="page-section narrow home-statement-section">
          <div className="wp-content" dangerouslySetInnerHTML={{ __html: statementHtml }} />
        </section>
      ) : null}
    </>
  );
}
