/** Use angular quotation marks inside the quotation; CSS supplies its outer pair. */
export function formatHomeStatementHtml(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  const quotation = document.querySelector("h4");
  if (!quotation) return html;

  // Work on text nodes, never the HTML string: quoted attributes and formatting
  // must remain untouched, and a citation can span several formatting elements.
  const walker = document.createTreeWalker(quotation, NodeFilter.SHOW_TEXT);
  let isOpen = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    node.textContent = (node.textContent ?? "").replace(/["“”„«»]/g, (character) => {
      if (character === "«") {
        isOpen = true;
        return "«";
      }
      if (character === "»") {
        isOpen = false;
        return "»";
      }
      isOpen = !isOpen;
      return isOpen ? "«" : "»";
    });
  }

  return document.body.innerHTML;
}
