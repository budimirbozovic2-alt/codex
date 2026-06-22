/**
 * PR-E2 — Cards mutations on pure TanStack + direct SQLite writes.
 * PR-H1 hardening:
 *   - `gradeSection.mutationFn` / `bulkPatch.mutationFn` delegate to
 *     `cardRepository.patch` / `cardRepository.bulkPatch` which perform
 *     atomic read-modify-write inside a single SQLite transaction, removing
 *     the double-read risk and the cache-as-source-of-truth anti-pattern.
 *   - Bulk mutations use `cardRepository.*Authoritative` which runs a
 *     `runBulkCardsWrite` session — one SQLite commit + coordinator seed.
 *     No `settle()` prefix invalidation; derived flush comes from commit.
 *
 * Each mutation:
 *   1. `onMutate` cancels in-flight `['cards', …]` queries and snapshots
 *      every active key, then applies an optimistic patch.
 *   2. `mutationFn` delegates to `cardRepository` (pure SQLite write).
 *   3. `onError` restores the snapshot.
 *
 * No Zustand RAM mirror, no `cardMapWrites`, no `cardCommandBus`.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { cardRepository, type ChapterFieldUpdate } from "@/lib/repositories";
import { queryKeys } from "@/lib/query/keys";
import { logger } from "@/lib/logger";

interface GradeInput {
  cardId: string;
  patcher: (card: Card) => Card;
  grade?: number;
  reviewLogEntry?: ReviewLogEntry;
}

interface BulkPatchInput {
  cardIds: string[];
  patcher: (card: Card) => Card;
}

interface RollbackCtx {
  entries: Array<[QueryKey, unknown]>;
}

// ─── Optimistic patch helpers ─────────────────────────────────────────────

function patchAllCards(
  qc: QueryClient,
  mutator: (prev: readonly Card[]) => readonly Card[],
): void {
  qc.setQueryData<readonly Card[] | undefined>(queryKeys.cards.all(), (prev) => {
    if (!prev) return prev;
    return mutator(prev);
  });
}

function upsertCardInList(
  prev: readonly Card[] | undefined,
  card: Card,
): readonly Card[] {
  if (!prev) return [card];
  const idx = prev.findIndex((c) => c.id === card.id);
  if (idx === -1) return [...prev, card];
  const next = prev.slice();
  next[idx] = card;
  return next;
}

function optimisticPut(qc: QueryClient, card: Card): void {
  const stamped = card.updatedAt ? card : { ...card, updatedAt: Date.now() };
  patchAllCards(qc, (prev) => upsertCardInList(prev, stamped) as Card[]);
  qc.setQueryData<readonly Card[] | undefined>(
    queryKeys.cards.byCategory(stamped.categoryId),
    (prev) => upsertCardInList(prev, stamped),
  );
  qc.setQueryData(["cards", "byId", card.id] as const, stamped);
}

function optimisticBulkPut(qc: QueryClient, cards: Card[]): void {
  if (cards.length === 0) return;
  const byId = new Map(cards.map((c) => [c.id, c]));
  patchAllCards(qc, (prev) => {
    const next = prev.map((c) => byId.get(c.id) ?? c);
    const seen = new Set(prev.map((c) => c.id));
    for (const c of cards) if (!seen.has(c.id)) next.push(c);
    return next;
  });
  for (const c of cards) qc.setQueryData(["cards", "byId", c.id] as const, c);
}

function optimisticRemove(qc: QueryClient, id: string): void {
  patchAllCards(qc, (prev) => prev.filter((c) => c.id !== id));
  qc.setQueryData(["cards", "byId", id] as const, null);
}

function optimisticPatch(
  qc: QueryClient,
  id: string,
  patcher: (card: Card) => Card,
): Card | undefined {
  let patched: Card | undefined;
  patchAllCards(qc, (prev) => {
    const idx = prev.findIndex((c) => c.id === id);
    if (idx === -1) return prev;
    patched = { ...patcher(prev[idx]), updatedAt: Date.now() };
    const next = prev.slice();
    next[idx] = patched;
    return next;
  });
  if (patched) qc.setQueryData(["cards", "byId", id] as const, patched);
  return patched;
}

function optimisticBulkPatch(
  qc: QueryClient,
  ids: string[],
  patcher: (card: Card) => Card,
): Card[] {
  if (ids.length === 0) return [];
  const now = Date.now();
  const wanted = new Set(ids);
  const updated: Card[] = [];
  patchAllCards(qc, (prev) => {
    const next = prev.map((c) => {
      if (!wanted.has(c.id)) return c;
      const u: Card = { ...patcher(c), updatedAt: now };
      updated.push(u);
      return u;
    });
    return next;
  });
  for (const c of updated) qc.setQueryData(["cards", "byId", c.id] as const, c);
  return updated;
}

// ─── Mutation hook ────────────────────────────────────────────────────────

export function useCardMutations() {
  const qc = useQueryClient();

  async function snapshot(): Promise<RollbackCtx> {
    await qc.cancelQueries({ queryKey: queryKeys.cards.root });
    const entries = qc.getQueriesData({ queryKey: queryKeys.cards.root });
    return { entries: entries.map(([k, v]) => [k, v]) };
  }

  function rollback(ctx: RollbackCtx | undefined): void {
    if (!ctx?.entries) return;
    for (const [key, data] of ctx.entries) {
      qc.setQueryData(key, data);
    }
  }

  const save = useMutation<Card, Error, Card, RollbackCtx>({
    mutationFn: (card) => cardRepository.put(card),
    onMutate: async (card) => {
      const ctx = await snapshot();
      optimisticPut(qc, card.updatedAt ? card : { ...card, updatedAt: Date.now() });
      return ctx;
    },
    onError: (err, card, ctx) => {
      logger.error("[useCardMutations] save persist failed", { id: card.id, err });
      toast.error("Snimanje kartice nije uspjelo — vraćam stanje.");
      rollback(ctx);
    },
  });

  const remove = useMutation<void, Error, string, RollbackCtx>({
    mutationFn: (id) => cardRepository.remove(id),
    onMutate: async (id) => {
      const ctx = await snapshot();
      optimisticRemove(qc, id);
      return ctx;
    },
    onError: (err, id, ctx) => {
      logger.error("[useCardMutations] remove persist failed", { id, err });
      toast.error("Brisanje nije uspjelo — vraćam stanje.");
      rollback(ctx);
    },
  });

  const bulkUpsert = useMutation<Card[], Error, Card[], RollbackCtx>({
    mutationFn: (cards) => cardRepository.bulkPutAuthoritative(cards),
    onMutate: async (cards) => {
      const ctx = await snapshot();
      const now = Date.now();
      const stamped = cards.map((c) => (c.updatedAt ? c : { ...c, updatedAt: now }));
      optimisticBulkPut(qc, stamped);
      return ctx;
    },
    onError: (err, cards, ctx) => {
      logger.error("[useCardMutations] bulkUpsert persist failed", { n: cards.length, err });
      toast.error("Snimanje serije kartica nije uspjelo — vraćam stanje.");
      rollback(ctx);
    },
  });

  const gradeSection = useMutation<Card | undefined, Error, GradeInput, RollbackCtx>({
    mutationFn: ({ cardId, patcher, grade, reviewLogEntry }) =>
      grade !== undefined && reviewLogEntry
        ? cardRepository.patchWithReviewGrade(cardId, grade, patcher, reviewLogEntry)
        : cardRepository.patch(cardId, patcher),
    onMutate: async ({ cardId, patcher }) => {
      const ctx = await snapshot();
      optimisticPatch(qc, cardId, patcher);
      return ctx;
    },
    onError: (err, { cardId }, ctx) => {
      logger.error("[useCardMutations] gradeSection persist failed", { cardId, err });
      toast.error("Snimanje gradacije nije uspjelo — vraćam stanje.");
      rollback(ctx);
    },
  });

  const bulkPatch = useMutation<Card[], Error, BulkPatchInput, RollbackCtx>({
    mutationFn: ({ cardIds, patcher }) =>
      cardRepository.bulkPatchAuthoritative(cardIds, patcher),
    onMutate: async ({ cardIds, patcher }) => {
      const ctx = await snapshot();
      optimisticBulkPatch(qc, cardIds, patcher);
      return ctx;
    },
    onError: (err, { cardIds }, ctx) => {
      logger.error("[useCardMutations] bulkPatch persist failed", { n: cardIds.length, err });
      toast.error("Bulk izmjena nije uspjela — vraćam stanje.");
      rollback(ctx);
    },
  });

  const bulkSetNeedsReview = useMutation<void, Error, string[], RollbackCtx>({
    mutationFn: (cardIds) => cardRepository.bulkSetNeedsReviewAuthoritative(cardIds),
    onMutate: async (cardIds) => {
      const ctx = await snapshot();
      optimisticBulkPatch(qc, cardIds, (c) => ({ ...c, needsReview: true }));
      return ctx;
    },
    onError: (err, cardIds, ctx) => {
      logger.error("[useCardMutations] bulkSetNeedsReview persist failed", { n: cardIds.length, err });
      toast.error("Označavanje kartica nije uspjelo — vraćam stanje.");
      rollback(ctx);
    },
  });

  const bulkUpdateChapter = useMutation<void, Error, ChapterFieldUpdate[], RollbackCtx>({
    mutationFn: (updates) => cardRepository.bulkUpdateChapterAuthoritative(updates),
    onMutate: async (updates) => {
      const ctx = await snapshot();
      const map = new Map(updates.map((u) => [u.id, u]));
      optimisticBulkPatch(qc, updates.map((u) => u.id), (c) => {
        const u = map.get(c.id)!;
        return { ...c, chapterId: u.chapterId, chapterOrder: u.chapterOrder };
      });
      return ctx;
    },
    onError: (err, updates, ctx) => {
      logger.error("[useCardMutations] bulkUpdateChapter persist failed", { n: updates.length, err });
      toast.error("Premještanje u poglavlje nije uspjelo — vraćam stanje.");
      rollback(ctx);
    },
  });

  return {
    save,
    remove,
    bulkUpsert,
    gradeSection,
    bulkPatch,
    bulkSetNeedsReview,
    bulkUpdateChapter,
  };
}
