// ─────────────────────────────────────────────────────────────────────────────
// Card Repository — single write gateway for card mutations.
//
// Every durable write runs through a single SQLite transaction
// (`runInTransaction`). After a successful commit the repository fires
// scoped `notifyCardsChanged` so bridges.ts invalidates only affected
// TanStack cache keys.
//
// Field-only patches (clearLinks, clearNeedsReview, bulkSetNeedsReview,
// bulkUpdateChapter) use SQLite json_set/json_remove — no payload decode.
// Generic `patch` / `bulkPatch` still decode in-process when the patcher is
// arbitrary JS, but bulkPatch batches writes via `runMany`.
// ─────────────────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { runInTransaction } from "@/lib/persistence/sqlite/client";
import {
  CARD_INSERT_SQL,
  bindCardInsert,
  decodeCard,
} from "@/lib/persistence/sqlite/row-codecs";
import {
  cardToScopeRef,
  emitAfterCardWrite,
  emitCardsChangedForRefs,
  fetchCardScopeRefs,
  type CardScopeRef,
} from "@/lib/db/queries/cards-notify-scope";
import {
  sqlClearCardLinksIn,
  SQL_CLEAR_NEEDS_REVIEW,
  SQL_SET_NEEDS_REVIEW,
  SQL_UPDATE_CHAPTER,
} from "@/lib/db/queries/cards-json-patches";

function stamp(card: Card, now: number): Card {
  return card.updatedAt ? card : { ...card, updatedAt: now };
}

async function put(card: Card): Promise<Card> {
  const stamped = stamp(card, Date.now());
  await runInTransaction((tx) => tx.run(CARD_INSERT_SQL, bindCardInsert(stamped)));
  emitAfterCardWrite(null, stamped);
  return stamped;
}

async function bulkPut(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const now = Date.now();
  const stamped = cards.map((c) => stamp(c, now));
  await runInTransaction((tx) =>
    tx.runMany(CARD_INSERT_SQL, stamped.map(bindCardInsert))
  );
  emitCardsChangedForRefs(stamped.map(cardToScopeRef));
  return stamped;
}

async function remove(id: string): Promise<void> {
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
  if (ref) emitCardsChangedForRefs([ref]);
}

/**
 * Atomic read-modify-write for a single card. The SELECT and INSERT OR REPLACE
 * happen inside the same transaction — no window for a concurrent write to
 * corrupt FSRS state between the read and the write.
 */
async function patch(
  id: string,
  patcher: (card: Card) => Card,
): Promise<Card | undefined> {
  let before: Card | undefined;
  let result: Card | undefined;
  await runInTransaction(async (tx) => {
    const rows = await tx.all<{ id: string; payload: string }>(
      "SELECT id, payload FROM cards WHERE id = ?",
      [id],
    );
    const row = rows[0];
    if (!row) return;
    const current = decodeCard(row);
    before = current;
    const updated: Card = { ...patcher(current), updatedAt: Date.now() };
    await tx.run(CARD_INSERT_SQL, bindCardInsert(updated));
    result = updated;
  });
  if (result && before) emitAfterCardWrite(before, result);
  return result;
}

/**
 * Atomic read-modify-write for a batch of cards. Reads directly from SQLite
 * (never from TanStack cache) so the repository is the source of truth.
 * Writes are batched with `runMany` to minimise worker IPC round-trips.
 */
async function bulkPatch(
  ids: string[],
  patcher: (card: Card) => Card,
): Promise<Card[]> {
  if (ids.length === 0) return [];
  const beforeRefs: CardScopeRef[] = [];
  const afterRefs: CardScopeRef[] = [];
  const updated: Card[] = [];
  await runInTransaction(async (tx) => {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await tx.all<{ id: string; payload: string }>(
      `SELECT id, payload FROM cards WHERE id IN (${placeholders})`,
      ids,
    );
    const now = Date.now();
    const batches = rows.map((row) => {
      const current = decodeCard(row);
      beforeRefs.push(cardToScopeRef(current));
      const u: Card = { ...patcher(current), updatedAt: now };
      afterRefs.push(cardToScopeRef(u));
      updated.push(u);
      return bindCardInsert(u);
    });
    if (batches.length > 0) {
      await tx.runMany(CARD_INSERT_SQL, batches);
    }
  });
  if (updated.length > 0) {
    emitCardsChangedForRefs([...beforeRefs, ...afterRefs]);
  }
  return updated;
}

/**
 * Clear sourceId / textAnchor / needsReview via json_remove (indexed sourceId
 * column cleared in the same statement). Returns [] — callers invalidate via
 * notifyCardsChanged, not returned instances.
 */
async function clearLinks(cardIds: string[]): Promise<Card[]> {
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
  if (refs.length > 0) emitCardsChangedForRefs(refs);
  return [];
}

/** Clear needsReview for one card. No-op if absent or already cleared. */
async function clearNeedsReview(id: string): Promise<Card | undefined> {
  let touched = false;
  let ref: CardScopeRef | null = null;
  const now = Date.now();
  await runInTransaction(async (tx) => {
    const pending = await tx.all<CardScopeRef>(
      `SELECT categoryId, subcategoryId, chapterId, sourceId
         FROM cards
        WHERE id = ?
          AND json_extract(payload, '$.needsReview') IS NOT NULL
        LIMIT 1`,
      [id],
    );
    if (pending.length === 0) return;
    ref = pending[0] ?? null;
    await tx.run(SQL_CLEAR_NEEDS_REVIEW, [now, now, id]);
    touched = true;
  });
  if (touched && ref) emitCardsChangedForRefs([ref]);
  return undefined;
}

/** Bulk-set needsReview=true without decoding payloads. */
async function bulkSetNeedsReview(cardIds: string[]): Promise<void> {
  if (cardIds.length === 0) return;
  const now = Date.now();
  await runInTransaction((tx) =>
    tx.runMany(
      SQL_SET_NEEDS_REVIEW,
      cardIds.map((id) => [now, now, id]),
    ),
  );
  const refs = await fetchCardScopeRefs(cardIds);
  if (refs.length > 0) emitCardsChangedForRefs(refs);
}

export interface ChapterFieldUpdate {
  id: string;
  chapterId: string;
  chapterOrder: number;
}

/** Bulk chapter reassignment — json_set on payload + chapterId column. */
async function bulkUpdateChapter(updates: ChapterFieldUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const now = Date.now();
  await runInTransaction((tx) =>
    tx.runMany(
      SQL_UPDATE_CHAPTER,
      updates.map((u) => [u.chapterId, now, u.chapterId, u.chapterOrder, now, u.id]),
    ),
  );
  const refs = await fetchCardScopeRefs(updates.map((u) => u.id));
  if (refs.length > 0) emitCardsChangedForRefs(refs);
}

export const cardRepository = {
  put,
  bulkPut,
  remove,
  patch,
  bulkPatch,
  clearLinks,
  clearNeedsReview,
  bulkSetNeedsReview,
  bulkUpdateChapter,
};
