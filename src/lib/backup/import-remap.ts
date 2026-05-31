/**
 * Pre-transaction helpers for backup-import:
 *   - narrow legacy `categories` union
 *   - build categoryId remap by name
 *   - apply remap to cards + satellite tables
 *   - prune orphan satellite rows whose categoryId no longer exists
 *
 * All functions are pure (or memory-only mutating) — they perform no IDB
 * writes. They are invoked from the orchestrator before opening the rw
 * transaction so the locked tx body stays as short as possible.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import { yieldUI } from "@/lib/backup/yield-ui";

/** Narrow `parsed.categories` (legacy union of CategoryRecord[] | string[]). */
export function isCategoryRecordArray(
  v: ParsedBackup["categories"],
): v is CategoryRecord[] {
  return v.length > 0 && typeof v[0] === "object" && v[0] !== null && "id" in v[0];
}

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
 * Apply a categoryId remap to all satellite tables in `parsed`, plus cards.
 *
 * @deprecated Use {@link applyRemapToParsedV2}. This signature accepts an
 * external `cardMap` and mutates it in place, which corrupts caller-owned
 * state (the live `currentMap` from `useCardImport`). Kept for backward
 * compatibility with existing tests.
 */
export async function applyRemapToParsed(
  remap: Map<string, string>,
  parsed: ParsedBackup,
  cardsToRemap: Card[],
  cardMap: Record<string, Card>,
): Promise<void> {
  if (remap.size === 0) return;
  let i = 0;
  for (const card of cardsToRemap) {
    const r = remap.get(card.categoryId);
    if (r) card.categoryId = r;
    if (++i % 1000 === 0) await yieldUI();
  }
  // Stream-iterate the in-memory map instead of materializing
  // `Object.values(cardMap)` (which allocates an N-sized array for a
  // 15k+ card DB). `for…in` over a plain object enumerates own keys
  // without any auxiliary allocation; periodic yields keep the UI thread
  // responsive on very large maps.
  let j = 0;
  for (const id in cardMap) {
    const card = cardMap[id];
    const r = remap.get(card.categoryId);
    if (r) card.categoryId = r;
    if (++j % 1000 === 0) await yieldUI();
  }
  await applyRemapToSatellites(remap, parsed);
}

/**
 * Apply a categoryId remap to `parsed.cards` and every satellite table.
 *
 * MUST be called BEFORE `mergeCardsByStrategy` so the merge sees the final
 * (post-remap) `categoryId` on every imported card. Never touches caller-
 * owned state (no `currentMap` / `cardMap` argument).
 */
export async function applyRemapToParsedV2(
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

/** Drop satellite rows whose `categoryId` no longer exists. */
export function pruneOrphans(parsed: ParsedBackup, validCategoryIds: Set<string>): void {
  parsed.sources = parsed.sources.filter((s) => !s.categoryId || validCategoryIds.has(s.categoryId));
  parsed.mnemonics = parsed.mnemonics.filter((m) => !m.categoryId || validCategoryIds.has(m.categoryId));
  parsed.knowledgeBaseArticles = parsed.knowledgeBaseArticles.filter(
    (a) => !a.subjectId || validCategoryIds.has(a.subjectId),
  );
  parsed.mindMaps = parsed.mindMaps.filter((m) => !m.categoryId || validCategoryIds.has(m.categoryId));
  // Safety net: cards are written from `merged` in the hot path, but any
  // future caller that writes directly from parsed.cards must not violate FK.
  parsed.cards = parsed.cards.filter((c) => !c.categoryId || validCategoryIds.has(c.categoryId));
}
