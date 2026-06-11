/**
 * Direct SQLite write helpers for cards.
 *
 * All writes go through `runInTransaction` (single ACID commit per call).
 * `notifyCardsChanged` is emitted after each successful commit so the
 * TanStack bridge invalidates `['cards', ...]` queries.
 *
 * For UI-initiated mutations prefer `cardRepository` (same mechanism,
 * richer API). These helpers remain for heal / migration / import paths
 * that live outside the React mutation layer.
 */
import type { Card } from "@/lib/spaced-repetition";
import { runInTransaction } from "@/lib/persistence/sqlite/client";
import {
  CARD_INSERT_SQL,
  bindCardInsert,
  decodeCard,
} from "@/lib/persistence/sqlite/row-codecs";
import { notifyCardsChanged, listAllCards } from "./cards";

function stamp(card: Card, now: number): Card {
  return card.updatedAt ? card : { ...card, updatedAt: now };
}

/** Single card upsert. */
export async function putCardDirect(card: Card): Promise<Card> {
  const stamped = stamp(card, Date.now());
  await runInTransaction((tx) => tx.run(CARD_INSERT_SQL, bindCardInsert(stamped)));
  notifyCardsChanged();
  return stamped;
}

/** Bulk upsert — all rows in one transaction. */
export async function bulkPutCardsDirect(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const now = Date.now();
  const stamped = cards.map((c) => stamp(c, now));
  await runInTransaction((tx) =>
    tx.runMany(CARD_INSERT_SQL, stamped.map(bindCardInsert))
  );
  notifyCardsChanged();
  return stamped;
}

/** Delete a card by id. */
export async function deleteCardDirect(id: string): Promise<void> {
  await runInTransaction((tx) => tx.run("DELETE FROM cards WHERE id = ?", [id]));
  notifyCardsChanged();
}

/**
 * Post-import cache invalidation only. The atomic import already wrote
 * rows in a dedicated SQL transaction; this just signals the bridge.
 * Accepts `Record<string, Card>` for legacy call-site signature parity;
 * the argument is intentionally unused.
 */
export function announceCardsReplaced(_nextMap: Record<string, Card>): void {
  void _nextMap;
  notifyCardsChanged();
}

/**
 * Clear `sourceId`/`textAnchor`/`needsReview` for a set of cards.
 * Reads and writes inside one transaction.
 */
export async function clearCardLinksDirect(cardIds: string[]): Promise<Card[]> {
  if (cardIds.length === 0) return [];
  const updated: Card[] = [];
  await runInTransaction(async (tx) => {
    const placeholders = cardIds.map(() => "?").join(",");
    const rows = await tx.all<{ id: string; payload: string }>(
      `SELECT id, payload FROM cards WHERE id IN (${placeholders})`,
      cardIds,
    );
    const now = Date.now();
    for (const row of rows) {
      const c = decodeCard(row);
      if (!c.sourceId) continue;
      const u: Card = { ...c, sourceId: undefined, textAnchor: undefined, needsReview: undefined, updatedAt: now };
      updated.push(u);
      await tx.run(CARD_INSERT_SQL, bindCardInsert(u));
    }
  });
  if (updated.length > 0) notifyCardsChanged();
  return updated;
}

/** Clear `needsReview` for one card. No-op if absent or already cleared. */
export async function clearCardNeedsReviewDirect(id: string): Promise<Card | undefined> {
  let written = false;
  let result: Card | undefined;
  await runInTransaction(async (tx) => {
    const rows = await tx.all<{ id: string; payload: string }>(
      "SELECT id, payload FROM cards WHERE id = ?",
      [id],
    );
    const row = rows[0];
    if (!row) return;
    const c = decodeCard(row);
    if (c.needsReview === undefined) { result = c; return; }
    const updated: Card = { ...c, needsReview: undefined, updatedAt: Date.now() };
    await tx.run(CARD_INSERT_SQL, bindCardInsert(updated));
    result = updated;
    written = true;
  });
  if (written) notifyCardsChanged();
  return result;
}

/** Snapshot the entire cards table from SQLite. */
export async function snapshotAllCards(): Promise<Card[]> {
  return listAllCards();
}
