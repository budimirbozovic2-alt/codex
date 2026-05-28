/**
 * Card-merge + cards-table write helpers for backup import (PR-9 A1c-4).
 *
 * `mergeCardsByStrategy` is pure (runs pre-tx). `writeCardsTx` now runs
 * inside the orchestrator's **SQLite** `exec.transaction` and writes via
 * `tx.run(CARD_INSERT_SQL, bindCardInsert(...))`. The Dexie `db.cards.*`
 * code path is gone — cards persist solely through SQLite.
 *
 * Overwrite strategy: `DELETE FROM cards` (FK CASCADE will not fire because
 * the parent rows are being rewritten in the same tx) followed by per-row
 * INSERTs. Non-overwrite strategies issue INSERT OR REPLACE for the merged
 * subset only and leave existing rows in place.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import {
  CARD_INSERT_SQL,
  bindCardInsert,
} from "@/lib/persistence/sqlite/row-codecs";
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

/**
 * SQLite-primary cards write. Must run inside the orchestrator's outer
 * `exec.transaction` so the BEGIN/COMMIT scope spans every table.
 */
export async function writeCardsTx(
  tx: SqlExecutor,
  merged: Card[],
  strategy: ImportStrategy,
): Promise<void> {
  if (strategy === "overwrite") {
    await tx.run("DELETE FROM cards");
  }
  if (merged.length > 0) {
    await tx.runMany(CARD_INSERT_SQL, merged.map((c) => bindCardInsert(c)));
  }
}

