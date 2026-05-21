/**
 * Card-merge + cards-table write helpers for backup import.
 *
 * `mergeCardsByStrategy` is pure (runs pre-tx). `writeCardsTx` runs
 * *inside* the orchestrator's rw transaction and assumes the parent
 * transaction owns the IDB lock — it issues raw `db.cards.bulkPut` /
 * `bulkDelete` calls and yields between batches.
 */
import { db } from "@/lib/db";
import type { Card } from "@/lib/spaced-repetition";
import { yieldUI } from "@/lib/backup/yield-ui";
import type { ImportStrategy } from "@/lib/backup/import-types";

/** Pre-merge imported cards into the in-memory map per strategy (pure). */
export function mergeCardsByStrategy(
  importedCards: Card[],
  currentMap: Record<string, Card>,
  strategy: ImportStrategy,
): { merged: Card[]; nextMap: Record<string, Card> } {
  const merged: Card[] = [];
  const nextMap: Record<string, Card> = { ...currentMap };

  if (strategy === "newer") {
    const getLastReview = (c: Card) =>
      c.sections.reduce((max, s) => Math.max(max, s.lastReviewed || 0), 0);
    importedCards.forEach((ic) => {
      const existing = nextMap[ic.id];
      if (!existing) { nextMap[ic.id] = ic; merged.push(ic); }
      else if (getLastReview(ic) > getLastReview(existing)) { nextMap[ic.id] = ic; merged.push(ic); }
    });
  } else if (strategy === "overwrite") {
    for (const key of Object.keys(nextMap)) delete nextMap[key];
    importedCards.forEach((ic) => { nextMap[ic.id] = ic; merged.push(ic); });
  } else {
    importedCards.forEach((ic) => {
      if (!nextMap[ic.id]) { nextMap[ic.id] = ic; merged.push(ic); }
    });
  }
  return { merged, nextMap };
}

/** Section 4c: bulk write cards, prune orphans on overwrite. */
export async function writeCardsTx(merged: Card[], strategy: ImportStrategy): Promise<void> {
  if (merged.length > 0) await db.cards.bulkPut(merged);
  if (strategy === "overwrite") {
    const allCardKeys = await db.cards.toCollection().primaryKeys();
    const importedIdSet = new Set(merged.map((c) => c.id));
    const orphanKeys = allCardKeys.filter((k) => !importedIdSet.has(k as string));
    if (orphanKeys.length > 0) await db.cards.bulkDelete(orphanKeys);
  }
  await yieldUI();
}
