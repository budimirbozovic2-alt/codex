import { db, type Source } from "./db";
import { parseArticles } from "./article-parser";

export type { Source };

/** Confirm a card's review flag (clear needsReview) */
export async function confirmCardReview(cardId: string): Promise<void> {
  await db.cards.update(cardId, { needsReview: undefined });
}

// ── In-memory sources cache (H4 fix) ──
let _cache: Source[] | null = null;

// ── Event-based invalidation signaling ──
type SourceListener = () => void;
const _listeners = new Set<SourceListener>();

/** Subscribe to source changes. Returns unsubscribe function. */
export function onSourcesChanged(fn: SourceListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function _notify(): void {
  _listeners.forEach(fn => fn());
}

/** Invalidate the in-memory sources cache (call after external mutations like import) */
export function invalidateSourcesCache(): void {
  _cache = null;
  _notify();
}

export async function loadSources(): Promise<Source[]> {
  if (_cache) return _cache;
  const sources = await db.sources.toArray();
  _cache = sources;
  return sources;
}

export async function saveSource(source: Source): Promise<void> {
  _cache = null;
  await db.sources.put(source);
  _notify();
}

export async function deleteSource(id: string): Promise<void> {
  _cache = null;
  await db.transaction("rw", [db.sources, db.cards], async () => {
    const linkedCards = await db.cards.where("sourceId").equals(id).toArray();
    if (linkedCards.length > 0) {
      const cleaned = linkedCards.map(c => ({
        ...c,
        sourceId: undefined,
        textAnchor: undefined,
        needsReview: undefined,
      }));
      await db.cards.bulkPut(cleaned);
    }
    await db.sources.delete(id);
  });
  _notify();
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

/** Parse and store articles from HTML */
export function extractArticles(html: string) {
  return parseArticles(html).map(a => ({
    id: a.id,
    number: a.number,
    title: a.title,
    text: a.text,
  }));
}

/**
 * Extract official gazette info from the first ~10 paragraphs of HTML.
 * Looks for patterns like "Zakon je objavljen u", "objavljen u Službenom",
 * "Sl. list", "Službeni glasnik", etc.
 */
export function extractOfficialGazette(html: string): string | undefined {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  // Search first 30 elements and also full text for broader coverage
  const elements = Array.from(doc.body.children).slice(0, 30);

  const patterns = [
    // "Zakon je objavljen u..."
    /zakon\s+je\s+objavljen\s+u[^.]*\./i,
    // "objavljen(a) (je) u Službenom..."
    /objavljen[a]?\s+(?:je\s+)?u\s+(?:"|„|")?služben[a-z]*\s+(?:list[a-z]*|glasnik[a-z]*|novin[a-z]*)[^.]*\./i,
    // "Službeni list/glasnik/novine ... br. ..."
    /(?:"|„|")?služben[a-z]*\s+(?:list[a-z]*|glasnik[a-z]*|novin[a-z]*)\s+[A-ZČĆŽŠĐa-zčćžšđ]+[^.]*br\.\s*\d[^.]*\./i,
    // Short forms
    /sl\.\s*list[^.]*br\.\s*\d[^.]*\./i,
    /sl\.\s*glasnik[^.]*br\.\s*\d[^.]*\./i,
    /sl\.\s*novin[a-z]*[^.]*br\.\s*\d[^.]*\./i,
    // "Narodne novine" (Croatian)
    /narodn[a-z]*\s+novin[a-z]*[^.]*br\.\s*\d[^.]*\./i,
    // Broader: any mention with gazette number pattern
    /(?:"|„|")?služben[a-z]*\s+(?:list[a-z]*|glasnik[a-z]*|novin[a-z]*)[^.]*\d+\/\d{4}[^.]*\./i,
  ];

  for (const el of elements) {
    const text = (el.textContent || "").trim();
    if (!text || text.length < 10) continue;

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
  }

  // Fallback: search entire text (some documents have it deeper)
  const fullText = doc.body.textContent || "";
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }

  return undefined;
}
