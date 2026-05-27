/**
 * PR-7f M3f — Cards cut-over (post B1 collapse).
 *
 * Wraps RAM-commit primitives from `@/lib/cards/cardMapWrites` in
 * `useMutation`. Each `mutationFn` performs the optimistic in-RAM commit,
 * awaits `persistQueue.cleanup()` so persist errors propagate, and returns
 * a `WriteResult`. The bridge (`onCardsChanged → invalidateQueries(['cards'])`)
 * picks up `notifyCardsChanged` emitted inside the commit helpers.
 *
 * onError rollback: re-read the affected ids from IDB via
 * `reloadCardsFromIdb` to bring RAM back in sync with the durable SSOT.
 *
 * `cardCommandBus` / `keyedMutex` around DB writes are DEPRECATED (Core
 * memory). SQLite ACID + persistQueue ordering is the only serialization
 * primitive.
 */
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Card } from "@/lib/spaced-repetition";
import * as cardMapWrites from "@/lib/cards/cardMapWrites";
import { persistQueue } from "@/lib/persist-queue";
import { wrapWrite, type WriteResult } from "@/lib/persistence/write-result";
import { logger } from "@/lib/logger";

function assertOk<T>(r: WriteResult<T>): T {
  if (r.ok === true) return r.value;
  const e = r.error;
  throw new Error(e.message || e.code);
}

interface GradeInput {
  cardId: string;
  patcher: (card: Card) => Card;
}

interface BulkPatchInput {
  cardIds: string[];
  patcher: (card: Card) => Card;
}

// ─── Inline async + WriteResult wrappers ──────────────────────────────────
// Moved out of the removed `cardRepository`. Each one performs the optimistic
// commit synchronously, then awaits `persistQueue.cleanup()` so a persist
// failure surfaces as `{ ok: false }`.

function putAsync(card: Card): Promise<WriteResult<Card>> {
  return wrapWrite(async () => {
    const stamped = card.updatedAt ? card : { ...card, updatedAt: Date.now() };
    cardMapWrites.put(stamped);
    await persistQueue.cleanup();
    return stamped;
  });
}

function bulkPutAsync(cards: Card[]): Promise<WriteResult<Card[]>> {
  return wrapWrite(async () => {
    if (cards.length === 0) return [];
    const now = Date.now();
    const stamped = cards.map((c) => (c.updatedAt ? c : { ...c, updatedAt: now }));
    cardMapWrites.bulkPut(stamped);
    await persistQueue.cleanup();
    return stamped;
  });
}

function removeAsync(id: string): Promise<WriteResult<void>> {
  return wrapWrite(async () => {
    cardMapWrites.remove(id);
    await persistQueue.cleanup();
  });
}

function patchAsync(
  id: string,
  patcher: (card: Card) => Card,
): Promise<WriteResult<Card | undefined>> {
  return wrapWrite(async () => {
    const updated = cardMapWrites.patch(id, patcher);
    await persistQueue.cleanup();
    return updated;
  });
}

function bulkPatchAsync(
  ids: string[],
  patcher: (card: Card) => Card,
): Promise<WriteResult<Card[]>> {
  return wrapWrite(async () => {
    const updated = cardMapWrites.bulkPatch(ids, patcher);
    await persistQueue.cleanup();
    return updated;
  });
}

export function useCardMutations() {
  const save = useMutation<Card, Error, Card>({
    mutationFn: async (card) => assertOk(await putAsync(card)),
    onError: (err, card) => {
      logger.error("[useCardMutations] save persist failed", { id: card.id, err });
      toast.error("Snimanje kartice nije uspjelo — vraćam stanje.");
      void cardMapWrites.reloadCardsFromIdb([card.id]);
    },
  });

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => { assertOk(await removeAsync(id)); },
    onError: (err, id) => {
      logger.error("[useCardMutations] remove persist failed", { id, err });
      toast.error("Brisanje nije uspjelo — vraćam stanje.");
      void cardMapWrites.reloadCardsFromIdb([id]);
    },
  });

  const bulkUpsert = useMutation<Card[], Error, Card[]>({
    mutationFn: async (cards) => assertOk(await bulkPutAsync(cards)),
    onError: (err, cards) => {
      logger.error("[useCardMutations] bulkUpsert persist failed", { n: cards.length, err });
      toast.error("Snimanje serije kartica nije uspjelo — vraćam stanje.");
      void cardMapWrites.reloadCardsFromIdb(cards.map(c => c.id));
    },
  });

  const gradeSection = useMutation<Card | undefined, Error, GradeInput>({
    mutationFn: async ({ cardId, patcher }) =>
      assertOk(await patchAsync(cardId, patcher)),
    onError: (err, { cardId }) => {
      logger.error("[useCardMutations] gradeSection persist failed", { cardId, err });
      toast.error("Snimanje gradacije nije uspjelo — vraćam stanje.");
      void cardMapWrites.reloadCardsFromIdb([cardId]);
    },
  });

  const bulkPatch = useMutation<Card[], Error, BulkPatchInput>({
    mutationFn: async ({ cardIds, patcher }) =>
      assertOk(await bulkPatchAsync(cardIds, patcher)),
    onError: (err, { cardIds }) => {
      logger.error("[useCardMutations] bulkPatch persist failed", { n: cardIds.length, err });
      toast.error("Bulk izmjena nije uspjela — vraćam stanje.");
      void cardMapWrites.reloadCardsFromIdb(cardIds);
    },
  });

  return { save, remove, bulkUpsert, gradeSection, bulkPatch };
}
