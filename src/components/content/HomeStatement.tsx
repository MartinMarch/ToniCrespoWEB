import { useMemo } from "react";
import { useEditablePage } from "../../app/editableContent";
import { formatHomeStatementHtml } from "../../lib/homeStatement";

export function HomeStatement() {
  const page = useEditablePage("home");
  const statementHtml = useMemo(() => formatHomeStatementHtml(page?.html ?? ""), [page?.html]);

  if (!page?.html) return null;

  return (
    <section className="page-section narrow home-statement-section">
      <div className="wp-content" dangerouslySetInnerHTML={{ __html: statementHtml }} />
    </section>
  );
}
