/**
 * Pre-transaction helpers for backup-import:
 *   - build categoryId remap by name
 *   - apply remap to cards + satellite tables
 *   - prune orphan satellite rows whose categoryId no longer exists
 */
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import { yieldUI } from "@/lib/backup/yield-ui";
import type { CategoryRecord } from "@/lib/db-types";

/** Build a categoryId remap by lowercased name match against existing rows. */
export function buildCategoryIdRemap(
  parsedCats: CategoryRecord[],
  existingCats: CategoryRecord[],
): Map<string, string> {
  const existingByName = new Map<string, string>();
  for (const c of existingCats) existingByName.set(c.name.toLowerCase(), c.id);
  const remap = new Map<string, string>();
  for (const cr of parsedCats) {
    const existingId = existingByName.get(cr.name.toLowerCase());
    if (existingId && existingId !== cr.id) remap.set(cr.id, existingId);
  }
  return remap;
}

/**
 * Apply a categoryId remap to `parsed.cards` and every satellite table.
 *
 * MUST be called BEFORE `mergeCardsByStrategy` so the merge sees the final
 * (post-remap) `categoryId` on every imported card. Mutates only `parsed` —
 * never touches caller-owned maps (e.g. live `currentMap` from import UI).
 */
export async function applyRemapToParsed(
  remap: Map<string, string>,
  parsed: ParsedBackup,
): Promise<void> {
  if (remap.size === 0) return;
  let i = 0;
  for (const card of parsed.cards) {
    const r = remap.get(card.categoryId);
    if (r) card.categoryId = r;
    if (++i % 1000 === 0) await yieldUI();
  }
  await applyRemapToSatellites(remap, parsed);
}

async function applyRemapToSatellites(
  remap: Map<string, string>,
  parsed: ParsedBackup,
): Promise<void> {
  for (const src of parsed.sources) {
    const r = remap.get(src.categoryId);
    if (r) src.categoryId = r;
  }
  for (const mn of parsed.mnemonics) {
    const r = remap.get(mn.categoryId);
    if (r) mn.categoryId = r;
  }
  for (const a of parsed.knowledgeBaseArticles) {
    const r = remap.get(a.subjectId);
    if (r) a.subjectId = r;
  }
  for (const m of parsed.mindMaps) {
    if (m.categoryId) {
      const r = remap.get(m.categoryId);
      if (r) m.categoryId = r;
    }
  }
}

/** Drop satellite rows whose `categoryId` no longer exists, and sanitize empty strings. */
export function pruneOrphans(parsed: ParsedBackup, validCategoryIds: Set<string>): void {
  const cleanFk = (id: string | null | undefined) =>
    id == null || id === "" ? undefined : id;

  parsed.sources = parsed.sources.filter((s) => {
    const categoryId = cleanFk(s.categoryId);
    if (categoryId !== undefined) s.categoryId = categoryId;
    return !categoryId || validCategoryIds.has(categoryId);
  });

  parsed.mnemonics = parsed.mnemonics.filter((m) => {
    const categoryId = cleanFk(m.categoryId);
    if (categoryId !== undefined) m.categoryId = categoryId;
    return !categoryId || validCategoryIds.has(categoryId);
  });

  parsed.knowledgeBaseArticles = parsed.knowledgeBaseArticles.filter((a) => {
    const subjectId = cleanFk(a.subjectId);
    if (subjectId !== undefined) a.subjectId = subjectId;
    return !subjectId || validCategoryIds.has(subjectId);
  });

  parsed.mindMaps = parsed.mindMaps.filter((m) => {
    const categoryId = cleanFk(m.categoryId);
    if (categoryId !== undefined) m.categoryId = categoryId;
    return !!categoryId && validCategoryIds.has(categoryId);
  });

  parsed.cards = parsed.cards.filter((c) => {
    const categoryId = cleanFk(c.categoryId);
    if (categoryId !== undefined) c.categoryId = categoryId;
    return !categoryId || validCategoryIds.has(categoryId);
  });
}
