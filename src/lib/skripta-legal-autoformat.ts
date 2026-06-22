/**
 * Auto-wrap statutory excerpts in skripta HTML with `legal-provision` blocks.
 * Complements manual marking via SourceBubbleMenu (Scale icon).
 */
const LEGAL_PARAGRAPH_START =
  /^(?:[Čč]lan(?:ak)?\s+\d+[a-z]?\.?|Sukladno\s|Prema\s|U\s+smislu\s|»|„|“)/;

export function autoFormatLegalProvisions(
  html: string,
): { html: string; count: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html");
  const wrapper = doc.body.firstElementChild as HTMLElement | null;
  if (!wrapper) return { html, count: 0 };

  let count = 0;

  wrapper.querySelectorAll("blockquote").forEach((bq) => {
    if (bq.closest(".legal-provision")) return;
    const shell = doc.createElement("div");
    shell.className = "legal-provision";
    while (bq.firstChild) {
      shell.appendChild(bq.firstChild);
    }
    bq.replaceWith(shell);
    count++;
  });

  const blocks = Array.from(
    wrapper.querySelectorAll("p, div:not(.legal-provision)"),
  );
  for (const block of blocks) {
    const el = block as HTMLElement;
    if (el.closest(".legal-provision")) continue;
    if (el.classList.contains("legal-provision")) continue;
    const text = (el.textContent || "").trim();
    if (!LEGAL_PARAGRAPH_START.test(text)) continue;

    const shell = doc.createElement("div");
    shell.className = "legal-provision";
    el.parentNode?.insertBefore(shell, el);
    shell.appendChild(el);
    count++;
  }

  return { html: wrapper.innerHTML, count };
}
