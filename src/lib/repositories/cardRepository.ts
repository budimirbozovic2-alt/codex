// ─────────────────────────────────────────────────────────────────────────────
// Card Repository — single write gateway for card mutations.
//
// Every durable write runs through a single SQLite transaction
// (`runInTransaction`). After a successful commit the repository fires
// `notifyCardsChanged` so the existing bridges.ts path invalidates TanStack
// cache — preserving all existing scoped-invalidation behaviour.
//
// Reads inside `patch` / `bulkPatch` are performed inside the same
// transaction as the write, guaranteeing atomic read-modify-write semantics
// and eliminating the double-read risk in the previous `gradeSection` path.
// ─────────────────────────────────────────────────────────────────────────────
import type { Card } from "@/lib/spaced-repetition";
import { runInTransaction } from "@/lib/persistence/sqlite/client";
import {
  CARD_INSERT_SQL,
  bindCardInsert,
  decodeCard,
} from "@/lib/persistence/sqlite/row-codecs";
import { notifyCardsChanged } from "@/lib/db/queries";

function stamp(card: Card, now: number): Card {
  return card.updatedAt ? card : { ...card, updatedAt: now };
}

async function put(card: Card): Promise<Card> {
  const stamped = stamp(card, Date.now());
  await runInTransaction((tx) => tx.run(CARD_INSERT_SQL, bindCardInsert(stamped)));
  notifyCardsChanged();
  return stamped;
}

async function bulkPut(cards: Card[]): Promise<Card[]> {
  if (cards.length === 0) return [];
  const now = Date.now();
  const stamped = cards.map((c) => stamp(c, now));
  await runInTransaction((tx) =>
    tx.runMany(CARD_INSERT_SQL, stamped.map(bindCardInsert))
  );
  notifyCardsChanged();
  return stamped;
}

async function remove(id: string): Promise<void> {
  await runInTransaction((tx) => tx.run("DELETE FROM cards WHERE id = ?", [id]));
  notifyCardsChanged();
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
  let result: Card | undefined;
  await runInTransaction(async (tx) => {
    const rows = await tx.all<{ id: string; payload: string }>(
      "SELECT id, payload FROM cards WHERE id = ?",
      [id],
    );
    const row = rows[0];
    if (!row) return;
    const current = decodeCard(row);
    const updated: Card = { ...patcher(current), updatedAt: Date.now() };
    await tx.run(CARD_INSERT_SQL, bindCardInsert(updated));
    result = updated;
  });
  if (result) notifyCardsChanged();
  return result;
}

/**
 * Atomic read-modify-write for a batch of cards. Reads directly from SQLite
 * (never from TanStack cache) so the repository is the source of truth.
 */
async function bulkPatch(
  ids: string[],
  patcher: (card: Card) => Card,
): Promise<Card[]> {
  if (ids.length === 0) return [];
  const updated: Card[] = [];
  await runInTransaction(async (tx) => {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await tx.all<{ id: string; payload: string }>(
      `SELECT id, payload FROM cards WHERE id IN (${placeholders})`,
      ids,
    );
    const now = Date.now();
    for (const row of rows) {
      const current = decodeCard(row);
      const u: Card = { ...patcher(current), updatedAt: now };
      updated.push(u);
      await tx.run(CARD_INSERT_SQL, bindCardInsert(u));
    }
  });
  if (updated.length > 0) notifyCardsChanged();
  return updated;
}

export const cardRepository = {
  put,
  bulkPut,
  remove,
  patch,
  bulkPatch,
};
