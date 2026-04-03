/**
 * Auto-formats legal articles ("Član X") in source HTML.
 * - Bolds the "Član X" line
 * - Bolds the preceding sibling (article name)
 * - Adds top margin for visual separation
 */

const CLAN_REGEX = /^\s*[Čč]lan\s+\d+\.?\s*$/;

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

    // Bold + margin on "Član X" line
    el.innerHTML = `<strong>${el.innerHTML}</strong>`;
    el.style.marginTop = "1.5em";
    el.dataset.articleFormatted = "1";

    // Bold preceding sibling (article name)
    const prev = el.previousElementSibling as HTMLElement | null;
    if (prev && !prev.dataset.articleFormatted) {
      const prevText = (prev.textContent || "").trim();
      // Don't bold if previous is already a heading or another Član
      if (prevText && !CLAN_REGEX.test(prevText) && !/^H[1-6]$/.test(prev.tagName)) {
        prev.innerHTML = `<strong>${prev.innerHTML}</strong>`;
        prev.dataset.articleFormatted = "1";
      }
    }
  });

  return { html: wrapper.innerHTML, count };
}
