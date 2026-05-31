/**
 * Aliases (case-form synonyms) attached to a Zettelkasten article.
 *
 * Aliases solve the grammatical-case problem for languages like Montenegrin:
 *   article.title    = "Krivično djelo"
 *   article.aliases  = ["krivičnog djela", "krivičnom djelu", "krivična djela"]
 *
 * They feed two systems:
 *   • Backlink index:  `[[krivičnog djela]]` resolves to "Krivično djelo".
 *   • Auto-create:     `[[krivičnog djela]]` does NOT create a new placeholder
 *     when its normalized form matches an existing article's alias.
 *
 * Aliases are **never** rendered as link text — the rendered display text
 * comes from the markdown source itself (or pipe display-half).
 */

export const ALIAS_LIMITS = {
  /** Hard cap per article. Higher than tags because cases multiply quickly. */
  maxPerArticle: 20,
  /** Length cap on a single alias entry. */
  maxLen: 60,
} as const;

/**
 * Audit #11: Assertive validation for persistence layer.
 * Throws if the alias list is not already normalized.
 */
export function assertAliasesNormalized(aliases: string[] | undefined): void {
  if (!aliases || aliases.length === 0) return;
  if (aliases.length > ALIAS_LIMITS.maxPerArticle) {
    throw new Error(`Alias count exceeds limit (${aliases.length} > ${ALIAS_LIMITS.maxPerArticle})`);
  }
  const seen = new Set<string>();
  for (const a of aliases) {
    if (typeof a !== "string") throw new Error("Alias must be a string");
    if (a !== normalizeAlias(a)) {
      throw new Error(`Alias "${a}" is not normalized (should be "${normalizeAlias(a)}")`);
    }
    if (seen.has(a)) throw new Error(`Duplicate alias detected: ${a}`);
    seen.add(a);
  }
}

/** Normalize a raw alias entry. Returns "" if the entry should be dropped. */
export function normalizeAlias(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  if (trimmed.length > ALIAS_LIMITS.maxLen) return "";
  // Forbid `[`, `]`, `|` — they collide with wiki-link syntax.
  if (/[[\]|]/.test(trimmed)) return "";
  return trimmed;
}

/** Normalize + dedupe a full list (preserves first-occurrence order). */
export function normalizeAliasList(input: readonly string[] | undefined): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const norm = normalizeAlias(raw);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= ALIAS_LIMITS.maxPerArticle) break;
  }
  return out;
}
