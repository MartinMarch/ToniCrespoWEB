/**
 * Separate the known editorial attribution without changing the stored poem.
 * Other names are not inferred: a dashed final verse can look like a byline.
 */
export function splitPoemAttribution(value: string): { body: string; author: string | null } {
  const body = value.replace(/\r\n?/g, "\n").trim();
  const lines = body.split("\n");
  const lastLine = lines[lines.length - 1].trim();
  const author = lastLine.replace(/^[—–-]\s*/, "");
  const normalizedAuthor = author.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  if (lines.length < 2 || !/^martin\s+march$/.test(normalizedAuthor)) {
    return { body, author: null };
  }

  return { body: lines.slice(0, -1).join("\n").trimEnd(), author };
}
