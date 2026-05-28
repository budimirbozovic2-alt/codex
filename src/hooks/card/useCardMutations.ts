/**
 * PR-7f M3f — Cards cut-over (post B1 collapse).
 *
 * Wraps RAM-commit primitives from `@/lib/cards/cardMapWrites` in
 * `useMutation`. Each `mutationFn` performs the optimistic in-RAM commit,
 * awaits `persistQueue.cleanup()` so persist errors propagate, and returns
 * a `WriteResult`. The bridge (`onCardsChanged → invalidateQueries(['cards'])`)
 * picks up `notifyCardsChanged` emitted inside the commit helpers.
 *
 * B1 cards cut-over — `onMutate` cancels in-flight queries, snapshots the
 * TanStack `['cards','all']` cache, and applies an optimistic patch. On
 * error we restore the snapshot AND call `reloadCardsFromDb` to resync the
 * Zustand mirror (which the granular selectors still read). The
 * Zustand→TanStack mirror in `useCardMapStore` keeps the cache live during
 * the synchronous commit so observers don't flash empty.
 *
 * `cardCommandBus` / `keyedMutex` around DB writes are DEPRECATED (Core
 * memory). SQLite ACID + persistQueue ordering is the only serialization
 * primitive.
 */
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Card } from "@/lib/spaced-repetition";
import * as cardMapWrites from "@/lib/cards/cardMapWrites";
import { persistQueue } from "@/lib/persist-queue";
import { wrapWrite, type WriteResult } from "@/lib/persistence/write-result";
import { queryKeys } from "@/lib/query/keys";
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

interface RollbackCtx {
  entries: Array<[QueryKey, unknown]>;
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
    // Phase 2b: async-fallback — hydrates RAM from SQLite if cold.
    await cardMapWrites.removeAsync(id);
    await persistQueue.cleanup();
  });
}

function patchAsync(
  id: string,
  patcher: (card: Card) => Card,
): Promise<WriteResult<Card | undefined>> {
  return wrapWrite(async () => {
    // Phase 2b: async-fallback — hydrates RAM from SQLite if cold.
    const updated = await cardMapWrites.patchAsync(id, patcher);
    await persistQueue.cleanup();
    return updated;
  });
}

function bulkPatchAsync(
  ids: string[],
  patcher: (card: Card) => Card,
): Promise<WriteResult<Card[]>> {
  return wrapWrite(async () => {
    // Phase 2b: async-fallback — hydrates RAM from SQLite if cold.
    const updated = await cardMapWrites.bulkPatchAsync(ids, patcher);
    await persistQueue.cleanup();
    return updated;
  });
}


export function useCardMutations() {
  const qc = useQueryClient();

  /** Snapshot `['cards','all']` and cancel in-flight refetches. */
  async function snapshot(): Promise<RollbackCtx> {
    await qc.cancelQueries({ queryKey: queryKeys.cards.root });
    return { prev: qc.getQueryData<Card[]>(queryKeys.cards.all()) };
  }

  /** Restore snapshot on persist failure and resync Zustand mirror. */
  function rollback(ctx: RollbackCtx | undefined, ids: string[]) {
    if (ctx?.prev !== undefined) {
      qc.setQueryData<Card[]>(queryKeys.cards.all(), [...ctx.prev]);
    }
    // Zustand mirror also needs to be brought back in sync — granular
    // selectors read from it directly.
    void cardMapWrites.reloadCardsFromDb(ids);
  }

  const save = useMutation<Card, Error, Card, RollbackCtx>({
    mutationFn: async (card) => assertOk(await putAsync(card)),
    onMutate: () => snapshot(),
    onError: (err, card, ctx) => {
      logger.error("[useCardMutations] save persist failed", { id: card.id, err });
      toast.error("Snimanje kartice nije uspjelo — vraćam stanje.");
      rollback(ctx, [card.id]);
    },
  });

  const remove = useMutation<void, Error, string, RollbackCtx>({
    mutationFn: async (id) => { assertOk(await removeAsync(id)); },
    onMutate: () => snapshot(),
    onError: (err, id, ctx) => {
      logger.error("[useCardMutations] remove persist failed", { id, err });
      toast.error("Brisanje nije uspjelo — vraćam stanje.");
      rollback(ctx, [id]);
    },
  });

  const bulkUpsert = useMutation<Card[], Error, Card[], RollbackCtx>({
    mutationFn: async (cards) => assertOk(await bulkPutAsync(cards)),
    onMutate: () => snapshot(),
    onError: (err, cards, ctx) => {
      logger.error("[useCardMutations] bulkUpsert persist failed", { n: cards.length, err });
      toast.error("Snimanje serije kartica nije uspjelo — vraćam stanje.");
      rollback(ctx, cards.map(c => c.id));
    },
  });

  const gradeSection = useMutation<Card | undefined, Error, GradeInput, RollbackCtx>({
    mutationFn: async ({ cardId, patcher }) =>
      assertOk(await patchAsync(cardId, patcher)),
    onMutate: () => snapshot(),
    onError: (err, { cardId }, ctx) => {
      logger.error("[useCardMutations] gradeSection persist failed", { cardId, err });
      toast.error("Snimanje gradacije nije uspjelo — vraćam stanje.");
      rollback(ctx, [cardId]);
    },
  });

  const bulkPatch = useMutation<Card[], Error, BulkPatchInput, RollbackCtx>({
    mutationFn: async ({ cardIds, patcher }) =>
      assertOk(await bulkPatchAsync(cardIds, patcher)),
    onMutate: () => snapshot(),
    onError: (err, { cardIds }, ctx) => {
      logger.error("[useCardMutations] bulkPatch persist failed", { n: cardIds.length, err });
      toast.error("Bulk izmjena nije uspjela — vraćam stanje.");
      rollback(ctx, cardIds);
    },
  });

  return { save, remove, bulkUpsert, gradeSection, bulkPatch };
}
