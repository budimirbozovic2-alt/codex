import { db, type Source } from "./db";

export type { Source };

export async function loadSources(): Promise<Source[]> {
  return db.sources.toArray();
}

export async function saveSource(source: Source): Promise<void> {
  await db.sources.put(source);
}

export async function deleteSource(id: string): Promise<void> {
  await db.sources.delete(id);
}

export async function getSource(id: string): Promise<Source | undefined> {
  return db.sources.get(id);
}

/** Extract heading outline from HTML */
export function extractOutline(html: string): { id: string; text: string; level: number }[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headings = doc.querySelectorAll("h1, h2, h3, h4");
  const outline: { id: string; text: string; level: number }[] = [];

  headings.forEach((h, i) => {
    const level = parseInt(h.tagName[1]);
    const id = `src-heading-${i}`;
    outline.push({ id, text: h.textContent?.trim() || `Heading ${i + 1}`, level });
  });

  return outline;
}

/** Inject IDs into headings so we can scroll to them */
export function injectHeadingIds(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const headings = doc.querySelectorAll("h1, h2, h3, h4");

  headings.forEach((h, i) => {
    h.setAttribute("id", `src-heading-${i}`);
  });

  return doc.body.innerHTML;
}

/** Generate a text anchor from selected text (first 80 chars normalized) */
export function createTextAnchor(text: string): string {
  return text.trim().substring(0, 80).toLowerCase().replace(/\s+/g, " ");
}

/** Find the approximate position of a text anchor in HTML content */
export function findAnchorInContent(htmlContent: string, anchor: string): string | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const normalized = node.textContent?.toLowerCase().replace(/\s+/g, " ") || "";
    if (normalized.includes(anchor)) {
      // Find parent element and return its nearest heading ID
      let el = node.parentElement;
      while (el) {
        if (el.id?.startsWith("src-heading-")) return el.id;
        // Check previous siblings for a heading
        let prev = el.previousElementSibling;
        while (prev) {
          if (prev.id?.startsWith("src-heading-")) return prev.id;
          prev = prev.previousElementSibling;
        }
        el = el.parentElement;
      }
      return null;
    }
  }
  return null;
}
