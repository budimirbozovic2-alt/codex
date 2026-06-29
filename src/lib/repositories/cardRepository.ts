// ─────────────────────────────────────────────────────────────────────────────

// Card Repository — single write gateway for card mutations.

//

// Every durable write runs through a single SQLite transaction

// (`runInTransaction`). After a successful commit the repository fires

// scoped TanStack invalidation via cards-invalidation (direct, no bridge debounce).

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
  CARD_DECODE_SELECT,

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
import {
  syncCardSections,
  syncCardSectionsMany,
} from "@/lib/persistence/sqlite/card-sections";
import type { ReviewLogEntry } from "@/lib/types/logs";
import {
  insertReviewLogInTx,
  syncParentEndangeredOnFlashGrade,
} from "@/lib/persistence/sqlite/card-saga-endangered-sync";
import { runBulkCardsWrite } from "@/lib/query/write-session";



export interface BulkCardWriteOpts {
  skipNotify?: boolean;
}

function stamp(card: Card, now: number): Card {

  return card.updatedAt ? card : { ...card, updatedAt: now };

}



async function put(card: Card): Promise<Card> {

  const stamped = stamp(card, Date.now());

  await runInTransaction(async (tx) => {
    await tx.run(CARD_INSERT_SQL, bindCardInsert(stamped));
    await syncCardSections(tx, stamped);
  });

  emitAfterCardWrite(null, stamped);

  return stamped;

}



async function bulkPut(cards: Card[], opts?: BulkCardWriteOpts): Promise<Card[]> {

  if (cards.length === 0) return [];

  const now = Date.now();

  const stamped = cards.map((c) => stamp(c, now));

  await runInTransaction(async (tx) => {
    await tx.runMany(CARD_INSERT_SQL, stamped.map(bindCardInsert));
    await syncCardSectionsMany(tx, stamped);
  });

  if (!opts?.skipNotify) {
    emitCardsChangedForRefs(stamped.map(cardToScopeRef));
  }

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

    const rows = await tx.all<{ id: string; payload: string; parentId?: string | null; isEndangered?: number | null }>(

      `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE id = ?`,

      [id],

    );

    const row = rows[0];

    if (!row) return;

    const current = decodeCard(row);

    before = current;

    const updated: Card = { ...patcher(current), updatedAt: Date.now() };

    await tx.run(CARD_INSERT_SQL, bindCardInsert(updated));
    await syncCardSections(tx, updated);

    result = updated;

  });

  if (result && before) emitAfterCardWrite(before, result);

  return result;

}



/**

 * Grade-driven patch: optional reviewLog row + parent essay endangered sync.

 */

async function patchWithReviewGrade(

  id: string,

  grade: number,

  patcher: (card: Card) => Card,

  reviewLogEntry?: ReviewLogEntry,

): Promise<Card | undefined> {

  let before: Card | undefined;

  let result: Card | undefined;

  let parentRef: CardScopeRef | null = null;

  await runInTransaction(async (tx) => {

    const rows = await tx.all<{ id: string; payload: string; parentId?: string | null; isEndangered?: number | null }>(

      `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE id = ?`,

      [id],

    );

    const row = rows[0];

    if (!row) return;

    const current = decodeCard(row);

    before = current;

    const now = Date.now();

    const updated: Card = { ...patcher(current), updatedAt: now };

    await tx.run(CARD_INSERT_SQL, bindCardInsert(updated));

    await syncCardSections(tx, updated);

    if (reviewLogEntry) {

      await insertReviewLogInTx(tx, reviewLogEntry);

    }

    const sync = await syncParentEndangeredOnFlashGrade(tx, updated, grade, now);

    if (sync.parentId) {

      const parentRows = await tx.all<CardScopeRef>(

        `SELECT categoryId, subcategoryId, chapterId, sourceId

           FROM cards WHERE id = ?`,

        [sync.parentId],

      );

      parentRef = parentRows[0] ?? null;

    }

    result = updated;

  });

  if (result && before) {

    emitAfterCardWrite(before, result);

    if (parentRef) emitCardsChangedForRefs([parentRef]);

  }

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

  opts?: BulkCardWriteOpts,

): Promise<Card[]> {

  if (ids.length === 0) return [];

  const beforeRefs: CardScopeRef[] = [];

  const afterRefs: CardScopeRef[] = [];

  const updated: Card[] = [];

  await runInTransaction(async (tx) => {

    const placeholders = ids.map(() => "?").join(",");

    const rows = await tx.all<{ id: string; payload: string }>(

      `SELECT ${CARD_DECODE_SELECT} FROM cards WHERE id IN (${placeholders})`,

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
      await syncCardSectionsMany(tx, updated);

    }

  });

  if (updated.length > 0 && !opts?.skipNotify) {

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

async function bulkSetNeedsReview(cardIds: string[], opts?: BulkCardWriteOpts): Promise<void> {

  if (cardIds.length === 0) return;

  const now = Date.now();

  await runInTransaction((tx) =>

    tx.runMany(

      SQL_SET_NEEDS_REVIEW,

      cardIds.map((id) => [now, now, id]),

    ),

  );

  if (!opts?.skipNotify) {
    const refs = await fetchCardScopeRefs(cardIds);

    if (refs.length > 0) emitCardsChangedForRefs(refs);
  }

}



export interface ChapterFieldUpdate {

  id: string;

  chapterId: string;

  chapterOrder: number;

}



/** Bulk chapter reassignment — json_set on payload + chapterId column. */

async function bulkUpdateChapter(updates: ChapterFieldUpdate[], opts?: BulkCardWriteOpts): Promise<void> {

  if (updates.length === 0) return;

  const now = Date.now();

  await runInTransaction((tx) =>

    tx.runMany(

      SQL_UPDATE_CHAPTER,

      updates.map((u) => [u.chapterId, now, u.chapterId, u.chapterOrder, now, u.id]),

    ),

  );

  if (!opts?.skipNotify) {
    const refs = await fetchCardScopeRefs(updates.map((u) => u.id));

    if (refs.length > 0) emitCardsChangedForRefs(refs);
  }

}



async function bulkPutAuthoritative(cards: Card[]): Promise<Card[]> {

  return runBulkCardsWrite(() => bulkPut(cards, { skipNotify: true }));

}



async function bulkPatchAuthoritative(

  ids: string[],

  patcher: (card: Card) => Card,

): Promise<Card[]> {

  return runBulkCardsWrite(() => bulkPatch(ids, patcher, { skipNotify: true }));

}



async function bulkSetNeedsReviewAuthoritative(cardIds: string[]): Promise<void> {

  return runBulkCardsWrite(() => bulkSetNeedsReview(cardIds, { skipNotify: true }));

}



async function bulkUpdateChapterAuthoritative(updates: ChapterFieldUpdate[]): Promise<void> {

  return runBulkCardsWrite(() => bulkUpdateChapter(updates, { skipNotify: true }));

}



/** Clear subcategoryId + chapterId for all cards under a subcategory. */
async function clearSubcategoryRefs(
  categoryId: string,
  subcategoryId: string,
): Promise<void> {
  const now = Date.now();
  await runInTransaction(async (tx) => {
    await tx.run(
      `UPDATE cards
          SET subcategoryId = NULL,
              chapterId     = NULL,
              updatedAt     = ?,
              payload       = json_set(
                                json_remove(
                                  payload,
                                  '$.subcategoryId',
                                  '$.chapterId'
                                ),
                                '$.updatedAt', ?
                              )
        WHERE categoryId = ? AND subcategoryId = ?`,
      [now, now, categoryId, subcategoryId],
    );
  });
}



/** Clear chapterId for all cards under a chapter. */
async function clearChapterRefs(
  categoryId: string,
  subcategoryId: string,
  chapterId: string,
): Promise<void> {
  const now = Date.now();
  await runInTransaction(async (tx) => {
    await tx.run(
      `UPDATE cards
          SET chapterId = NULL,
              updatedAt = ?,
              payload   = json_set(
                            json_remove(payload, '$.chapterId'),
                            '$.updatedAt', ?
                          )
        WHERE categoryId    = ?
          AND subcategoryId = ?
          AND chapterId     = ?`,
      [now, now, categoryId, subcategoryId, chapterId],
    );
  });
}



/** Reassign cards to a new subcategoryId (payload + indexed column). */
async function reassignSubcategory(
  ids: readonly string[],
  subcategoryId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  await runInTransaction(async (tx) => {
    await tx.runMany(
      `UPDATE cards
          SET subcategoryId = ?,
              updatedAt     = ?,
              payload       = json_set(payload,
                                '$.subcategoryId', ?,
                                '$.updatedAt',     ?)
        WHERE id = ?`,
      ids.map((id) => [subcategoryId, now, subcategoryId, now, id]),
    );
  });
}



export const cardRepository = {

  put,

  bulkPut,

  bulkPutAuthoritative,

  remove,

  patch,

  patchWithReviewGrade,

  bulkPatch,

  bulkPatchAuthoritative,

  clearLinks,

  clearNeedsReview,

  bulkSetNeedsReview,

  bulkSetNeedsReviewAuthoritative,

  bulkUpdateChapter,

  bulkUpdateChapterAuthoritative,

  clearSubcategoryRefs,

  clearChapterRefs,

  reassignSubcategory,

};


