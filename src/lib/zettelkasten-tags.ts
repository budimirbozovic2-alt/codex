/**
 * Tag helpers for Zettelkasten articles.
 *
 * Tags are intentionally minimalistic: they are a per-article free-form list
 * of short labels used **only** for filtering inside the Explorer panel. They
 * never participate in search ranking, never alter persistence shape, and
 * never imply any hierarchical relationship between articles. The Zettelkasten
 * remains an organic graph; tags are just an optional "scent" the user can
 * follow when looking for a specific theme.
 *
 * Invariants enforced here:
 *  - Every stored tag is lowercase, trimmed, has any leading `#` stripped.
 *  - Whitespace inside a tag collapses to single `-` so multi-word tags stay
 *    visually atomic (e.g. `Ljudska prava` -> `ljudska-prava`).
 *  - Tolerates Unicode letters (Bosnian diacritics) but drops other punctuation.
 *  - Hard cap of 8 tags per article — keeps the chip strip readable and
 *    prevents tag-list explosions becoming a de-facto taxonomy.
 *  - Hard cap of 32 chars per tag — avoids accidental sentence-as-tag inputs.
 *
 * Pure functions; no DB or React coupling.
 */

const MAX_TAGS_PER_ARTICLE = 8;
const MAX_TAG_LENGTH = 32;

/** Strip leading `#`, lowercase, trim, collapse internal whitespace to `-`. */
export function normalizeTag(raw: string): string {
  if (!raw) return "";
  let t = raw.trim();
  if (!t) return "";
  // Strip any number of leading `#` so `##načelo` and `# načelo` both work.
  t = t.replace(/^#+\s*/, "");
  // Collapse internal whitespace runs to a single hyphen.
  t = t.replace(/\s+/g, "-");
  // Drop characters that are neither letters/numbers/`-`/`_` (keep diacritics).
  // \p{L} = any kind of letter, \p{N} = any kind of number.
  t = t.replace(/[^\p{L}\p{N}_-]/gu, "");
  t = t.toLowerCase();
  if (t.length > MAX_TAG_LENGTH) t = t.slice(0, MAX_TAG_LENGTH);
  return t;
}

/**
 * Normalize + dedupe a list of raw tag inputs, preserving the order of first
 * occurrence. Empty results after normalization are dropped. Caps the final
 * list to `MAX_TAGS_PER_ARTICLE`.
 */
export function normalizeTagList(raw: readonly string[] | undefined): string[] {
  if (!raw || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const t = normalizeTag(r);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS_PER_ARTICLE) break;
  }
  return out;
}

/**
 * Aggregate per-tag usage counts across a list of articles.
 * Used by the Explorer panel to render the filter chip strip with counts.
 * Returns entries already sorted by descending count, then alpha for ties.
 */
export function getTagCounts(
  articles: readonly { tags?: string[] }[],
): Array<{ tag: string; count: number }> {
  const map = new Map<string, number>();
  for (const a of articles) {
    if (!a.tags || a.tags.length === 0) continue;
    // Defensively re-normalize in case a stale row predates normalization.
    const seenInArticle = new Set<string>();
    for (const raw of a.tags) {
      const t = normalizeTag(raw);
      if (!t || seenInArticle.has(t)) continue;
      seenInArticle.add(t);
      map.set(t, (map.get(t) ?? 0) + 1);
    }
  }
  const entries: Array<{ tag: string; count: number }> = [];
  for (const [tag, count] of map) entries.push({ tag, count });
  entries.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "bs"));
  return entries;
}

/**
 * OR-style filter: an article matches if it has *any* of the active tags.
 * We pick OR (not AND) because the Zettelkasten is meant to be exploratory —
 * widening the net helps the user discover loosely-related branches rather
 * than narrowing them down to a precise intersection.
 *
 * When `activeTags` is empty, every article passes through unchanged.
 */
export function filterByActiveTags<T extends { tags?: string[] }>(
  articles: readonly T[],
  activeTags: ReadonlySet<string>,
): T[] {
  if (activeTags.size === 0) return articles.slice();
  const out: T[] = [];
  for (const a of articles) {
    if (!a.tags || a.tags.length === 0) continue;
    for (const t of a.tags) {
      if (activeTags.has(normalizeTag(t))) {
        out.push(a);
        break;
      }
    }
  }
  return out;
}

export const TAG_LIMITS = {
  maxPerArticle: MAX_TAGS_PER_ARTICLE,
  maxTagLength: MAX_TAG_LENGTH,
} as const;
