/**
 * Single source of truth for `[[wiki-link]]` syntax parsing.
 *
 * Two forms are supported:
 *   1. `[[Naslov]]`            → target = "Naslov", display = "Naslov"
 *   2. `[[Naslov|prikaz]]`     → target = "Naslov", display = "prikaz"
 *
 * Why a piped form: the language has grammatical cases (e.g. "krivičnog djela")
 * but the canonical article title is in nominative ("Krivično djelo"). The
 * pipe lets authors write naturally while still pointing at the canonical id.
 *
 * Regex notes:
 *   - `target`  excludes `[`, `]`, `|` so we never swallow nested constructs.
 *   - `display` excludes `[`, `]`. A literal pipe inside the display half is
 *     therefore not supported (kept simple, matches Obsidian / Notion).
 *   - Lazy quantifiers + explicit character classes ⇒ no catastrophic
 *     backtracking on adversarial input.
 */
export const WIKI_LINK_RE = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g;

export interface WikiLinkMatch {
  /** Trimmed target title (case preserved). */
  target: string;
  /** Trimmed display text (case preserved). Equals target when no pipe. */
  display: string;
  /** Char index of the opening `[[` in the source string. */
  index: number;
  /** The raw matched substring including `[[ ]]`. */
  raw: string;
  /** True when the source used the piped form (`[[T|D]]`). */
  hasPipe: boolean;
}

/** Iterate all wiki-link matches in `text`. Empty/whitespace targets are skipped. */
export function* iterateWikiLinks(text: string): Generator<WikiLinkMatch> {
  // Local regex copy — generators are resumable, mutating .lastIndex of a
  // shared instance would race with concurrent callers.
  const re = new RegExp(WIKI_LINK_RE.source, WIKI_LINK_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const target = m[1].trim();
    if (!target) continue;
    const rawDisplay = m[2]?.trim();
    yield {
      target,
      display: rawDisplay && rawDisplay.length > 0 ? rawDisplay : target,
      index: m.index,
      raw: m[0],
      hasPipe: m[2] !== undefined,
    };
  }
}

/** Lowercase + trim. The single normalization rule used everywhere. */
export function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}
