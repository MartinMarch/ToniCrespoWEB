export type SupportKind = "canvas" | "paper";

export function getSupportCollectionPath(kind: SupportKind, slug: string) {
  return `/${kind === "canvas" ? "lienzos" : "laminas"}/${slug}`;
}
