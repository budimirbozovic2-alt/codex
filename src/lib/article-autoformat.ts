/**
 * Auto-formats legal articles ("Clan X") in source HTML.
 * - Bolds the "Clan X" line
 * - Bolds the preceding sibling (article name)
 * - Adds top margin for visual separation
 *
 * PR-H1: Never round-trip user content through innerHTML.
 * The DOM-mutation path below moves existing child nodes 
 * into a fresh strong element with appendChild, 
 * which never re-parses HTML.
 */

const CLAN_REGEX = /^\s*[Čč]lan\s+\d+\.?\s*$/;

function wrapChildrenInStrong(el: HTMLElement): void {
  const doc = el.ownerDocument;
  const strong = doc.createElement("strong");
  while (el.firstChild) {
    strong.appendChild(el.firstChild);
  }
  el.appendChild(strong);
}

export function autoFormatArticles(html: string): { html: string; count: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const wrapper = doc.body.firstElementChild as HTMLElement;
  if (!wrapper) return { html, count: 0 };

  const blocks = wrapper.querySelectorAll("p, div:not([class])");
  let count = 0;

  blocks.forEach((block) => {
    const el = block as HTMLElement;
    const text = (el.textContent || "").trim();
    if (!CLAN_REGEX.test(text)) return;

    // Already formatted?
    if (el.dataset.articleFormatted) return;

    count++;

    // Bold + margin on "Clan X" line (no innerHTML round-trip).
    wrapChildrenInStrong(el);
    el.style.marginTop = "1.5em";
    el.dataset.articleFormatted = "1";

    // Bold preceding sibling (article name)
    const prev = el.previousElementSibling as HTMLElement | null;
    if (prev && !prev.dataset.articleFormatted) {
      const prevText = (prev.textContent || "").trim();
      // Don't bold if previous is already a heading or another Clan
      if (prevText && !CLAN_REGEX.test(prevText) && !/^H[1-6]$/.test(prev.tagName)) {
        wrapChildrenInStrong(prev);
        prev.dataset.articleFormatted = "1";
      }
    }
  });

  return { html: wrapper.innerHTML, count };
}