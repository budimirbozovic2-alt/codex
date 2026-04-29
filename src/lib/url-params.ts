/**
 * Centralized query-param reader with backward-compatible aliases.
 *
 * Canonical names (always used when WRITING new links):
 *   - category     → categoryId
 *   - subcategory  → subcategoryId
 *   - chapter      → chapterId
 *   - source       → sourceId
 *   - card         → cardId
 *
 * Legacy aliases are kept here so old bookmarks keep working forever.
 * Add new aliases ONLY here — every reader uses `getParam` and stays in sync.
 */
const ALIASES: Record<string, readonly string[]> = {
  category: ["category", "cat", "subject"],
  subcategory: ["subcategory", "sub"],
  chapter: ["chapter"],
  source: ["source"],
  card: ["card"],
  tab: ["tab"],
  mode: ["mode"],
  type: ["type"],
  freq: ["freq", "frequency"],
  sort: ["sort"],
};

/** Read a query param by canonical name, falling back to known aliases. */
export function getParam(sp: URLSearchParams, key: string): string | null {
  const aliases = ALIASES[key] ?? [key];
  for (const k of aliases) {
    const v = sp.get(k);
    if (v) return v;
  }
  return null;
}

/** Build a `?a=b&c=d` query string from a record, skipping empty values. */
export function buildQuery(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
