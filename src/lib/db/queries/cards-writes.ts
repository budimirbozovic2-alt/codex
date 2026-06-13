/**
 * Direct SQLite write helpers for cards.
 *
 * All writes go through `runInTransaction` (single ACID commit per call).
 * Scoped `notifyCardsChanged` is emitted after each successful commit so the
 * TanStack bridge invalidates affected `['cards', ...]` queries.
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
} from "@/lib/persistence/sqlite/row-codecs";
import { listAllCards, notifyCardsChanged } from "./cards";
import {
  cardToScopeRef,
  emitAfterCardWrite,
  emitCardsChangedForRefs,
  type CardScopeRef,
} from "./cards-notify-scope";
import {
  sqlClearCardLinksIn,
  SQL_CLEAR_NEEDS_REVIEW,
} from "./cards-json-patches";

export interface DirectWriteOptions {
  /** Caller emits scoped invalidation (e.g. cross-category moves). */
  skipNotify?: boolean;
}

function stamp(card: Card, now: number): Card {
  return card.updatedAt ? card : { ...card, updatedAt: now };
}

/** Single card upsert. */
export async function putCardDirect(
  card: Card,
  opts?: DirectWriteOptions,
): Promise<Card> {
  const stamped = stamp(card, Date.now());
  await runInTransaction((tx) => tx.run(CARD_INSERT_SQL, bindCardInsert(stamped)));
  if (!opts?.skipNotify) emitAfterCardWrite(null, stamped);
  return stamped;
}

/** Bulk upsert — all rows in one transaction. */
export async function bulkPutCardsDirect(
  cards: Card[],
  opts?: DirectWriteOptions,
): Promise<Card[]> {
  if (cards.length === 0) return [];
  const now = Date.now();
  const stamped = cards.map((c) => stamp(c, now));
  await runInTransaction((tx) =>
    tx.runMany(CARD_INSERT_SQL, stamped.map(bindCardInsert))
  );
  if (!opts?.skipNotify) {
    emitCardsChangedForRefs(stamped.map(cardToScopeRef));
  }
  return stamped;
}

/** Delete a card by id. */
export async function deleteCardDirect(
  id: string,
  opts?: DirectWriteOptions,
): Promise<void> {
  let ref: CardScopeRef | null = null;
  await runInTransaction(async (tx) => {
    const rows = await tx.all<CardScopeRef>(
      `SELECT categoryId, subcategoryId, chapterId, sourceId
         FROM cards WHERE id = ?`,
      [id],
    );
    ref = rows[0] ?? null;
    await tx.run("DELETE FROM cards WHERE id = ?", [id]);
  });
  if (!opts?.skipNotify && ref) emitCardsChangedForRefs([ref]);
}

/**
 * Post-import cache invalidation only. The atomic import already wrote
 * rows in a dedicated SQL transaction; this just signals the bridge.
 * Accepts `Record<string, Card>` for legacy call-site signature parity;
 * the argument is intentionally unused.
 */
export function announceCardsReplaced(_nextMap: Record<string, Card>): void {
  void _nextMap;
  notifyCardsChanged({ kind: "all" });
}

/**
 * Clear `sourceId`/`textAnchor`/`needsReview` for a set of cards.
 * Single UPDATE — payload is patched in SQLite via json_remove/json_set
 * (no decode/re-encode round-trip over the OPFS worker bridge).
 */
export async function clearCardLinksDirect(
  cardIds: string[],
  opts?: DirectWriteOptions,
): Promise<Card[]> {
  if (cardIds.length === 0) return [];
  const now = Date.now();
  const placeholders = cardIds.map(() => "?").join(",");
  let refs: CardScopeRef[] = [];
  await runInTransaction(async (tx) => {
    refs = await tx.all<CardScopeRef>(
      `SELECT categoryId, subcategoryId, chapterId, sourceId
         FROM cards WHERE id IN (${placeholders})`,
      cardIds,
    );
    await tx.run(sqlClearCardLinksIn(placeholders), [now, now, ...cardIds]);
  });
  if (!opts?.skipNotify && refs.length > 0) emitCardsChangedForRefs(refs);
  return [];
}

/** Clear `needsReview` for one card. No-op if absent or already cleared. */
export async function clearCardNeedsReviewDirect(
  id: string,
  opts?: DirectWriteOptions,
): Promise<Card | undefined> {
  let ref: CardScopeRef | null = null;
  const now = Date.now();
  await runInTransaction(async (tx) => {
    const rows = await tx.all<CardScopeRef>(
      `SELECT categoryId, subcategoryId, chapterId, sourceId
         FROM cards
        WHERE id = ?
          AND json_extract(payload, '$.needsReview') IS NOT NULL
        LIMIT 1`,
      [id],
    );
    ref = rows[0] ?? null;
    if (!ref) return;
    await tx.run(SQL_CLEAR_NEEDS_REVIEW, [now, now, id]);
  });
  if (!opts?.skipNotify && ref) emitCardsChangedForRefs([ref]);
  return undefined;
}

/** Snapshot the entire cards table from SQLite. */
export async function snapshotAllCards(): Promise<Card[]> {
  return listAllCards();
}
