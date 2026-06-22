/**
 * Detect module boundaries in script-style HTML where each module starts with
 * bold text ending in a period (e.g. `<p><strong>Obligacioni odnos.</strong> …</p>`).
 */

const MAX_TITLE_CHARS = 120;
const MAX_TITLE_WORDS = 12;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isBoldPeriodTitleText(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || !t.endsWith(".")) return false;
  if (t.length > MAX_TITLE_CHARS) return false;
  if (wordCount(t) > MAX_TITLE_WORDS) return false;
  return true;
}

function isBoldElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === "strong" || tag === "b") return true;
  const style = el.getAttribute("style") ?? "";
  return /font-weight\s*:\s*(bold|[67]00)/i.test(style);
}

function findLeadingBold(el: Element): Element | null {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!(node.textContent ?? "").trim()) continue;
      return null;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;

    const child = node as Element;
    if (isBoldElement(child)) return child;

    const tag = child.tagName.toLowerCase();
    if (tag === "span" || tag === "em" || tag === "i") {
      const inner = child.querySelector("strong, b");
      if (inner && child.firstElementChild === inner) {
        const beforeInner = Array.from(child.childNodes).slice(
          0,
          Array.from(child.childNodes).indexOf(inner),
        );
        if (beforeInner.every((n) => !(n.textContent ?? "").trim())) {
          return inner;
        }
      }
    }
    return null;
  }
  return null;
}

function serializeSiblingNodes(nodes: Node[]): string {
  return nodes
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
      if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML;
      return "";
    })
    .join("")
    .trim();
}

function bodyHtmlAfterBold(el: Element, boldEl: Element): string {
  const nodes = Array.from(el.childNodes);
  const boldIndex = nodes.indexOf(boldEl);
  if (boldIndex < 0) return "";

  const rest = nodes.slice(boldIndex + 1);
  const html = serializeSiblingNodes(rest);
  if (!html) return "";

  if (/^<(p|div|ul|ol|h[1-6]|blockquote|table)/i.test(html)) {
    return html;
  }
  return `<p>${html}</p>`;
}

export interface BoldPeriodModuleStart {
  title: string;
  bodyHtml: string;
}

function normalizeTitle(boldText: string): string {
  return boldText.replace(/\.\s*$/, "").trim() || boldText.trim();
}

/**
 * Returns module title + optional inline body when `el` starts a script-style module.
 */
export function extractBoldPeriodModuleStart(el: Element): BoldPeriodModuleStart | null {
  const tag = el.tagName.toLowerCase();
  if (tag !== "p" && tag !== "div" && tag !== "li") return null;

  const boldEl = findLeadingBold(el);
  if (!boldEl) return null;

  const boldText = boldEl.textContent?.trim() ?? "";
  if (!isBoldPeriodTitleText(boldText)) return null;

  return {
    title: normalizeTitle(boldText),
    bodyHtml: bodyHtmlAfterBold(el, boldEl),
  };
}

/**
 * Count how many elements in the HTML look like script module titles.
 */
export function countBoldPeriodModuleMarkers(htmlContent: string): number {
  if (!htmlContent.trim()) return 0;

  const doc = new DOMParser().parseFromString(htmlContent, "text/html");
  let count = 0;
  for (const el of Array.from(doc.body.querySelectorAll("p, div, li"))) {
    if (extractBoldPeriodModuleStart(el)) count++;
  }
  return count;
}

export function suggestBoldPeriodSectionSplit(htmlContent: string): boolean {
  return countBoldPeriodModuleMarkers(htmlContent) >= 2;
}
