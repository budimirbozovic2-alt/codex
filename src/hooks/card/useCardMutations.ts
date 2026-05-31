/**
 * PR-E2 — Cards mutations on pure TanStack + direct SQLite writes.
 * PR-H1 hardening:
 *   - `gradeSection.mutationFn` reads pre-patch row directly from SQLite
 *     (`getCardsByIds`) instead of from cache. The cache is already
 *     optimistically patched by `onMutate`, so reading there would
 *     re-apply the patcher and double-decay FSRS memory state.
 *   - `settle()` invalidation is dropped from `save`/`remove`/`gradeSection`.
 *     Single-card writes emit `notifyCardsChanged` from the `*Direct`
 *     helpers, and the query bridge already invalidates the relevant
 *     `['cards', …]` scopes. Bulk mutations keep `settle()` because they
 *     touch many scoped slices the bridge may collapse.
 *
 * Each mutation:
 *   1. `onMutate` cancels in-flight `['cards', …]` queries and snapshots
 *      every active key, then applies an optimistic patch.
 *   2. `mutationFn` writes directly to SQLite via `*Direct` helpers.
 *   3. `onError` restores the snapshot.
 *
 * No Zustand RAM mirror, no `cardMapWrites`, no `cardCommandBus`.
 */
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Card } from "@/lib/spaced-repetition";
import {
  putCardDirect,
  bulkPutCardsDirect,
  deleteCardDirect,
  getCardsByIds,
} from "@/lib/db/queries";
import { queryKeys } from "@/lib/query/keys";
import { logger } from "@/lib/logger";

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

function optimisticPut(qc: QueryClient, card: Card): void {
  patchAllCards(qc, (prev) => {
    const idx = prev.findIndex((c) => c.id === card.id);
    if (idx === -1) return [...prev, card];
    const next = prev.slice();
    next[idx] = card;
    return next;
  });
  qc.setQueryData(["cards", "byId", card.id] as const, card);
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

  /**
   * Safety-net for bulk mutations: invalidate the entire `['cards']` prefix
   * after settle. NOT used for single-card mutations — those rely on the
   * bridge's scoped invalidation triggered by `notifyCardsChanged` inside
   * the `*Direct` helpers (PR-H1 fix: avoids double-invalidation storm).
   */
  function settle(): void {
    void qc.invalidateQueries({ queryKey: queryKeys.cards.root });
  }

  const save = useMutation<Card, Error, Card, RollbackCtx>({
    mutationFn: (card) => putCardDirect(card),
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
    mutationFn: (id) => deleteCardDirect(id),
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
    mutationFn: (cards) => bulkPutCardsDirect(cards),
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
    onSettled: settle,
  });

  const gradeSection = useMutation<Card | undefined, Error, GradeInput, RollbackCtx>({
    mutationFn: async ({ cardId, patcher }) => {
      // PR-H1: read pre-patch row directly from SQLite. Reading from the
      // TanStack cache would return the already-optimistically-patched
      // card and re-apply `patcher`, doubling FSRS decay on every grade.
      const rows = await getCardsByIds([cardId]);
      const current = rows[0];
      if (!current) return undefined;
      const updated: Card = { ...patcher(current), updatedAt: Date.now() };
      await putCardDirect(updated);
      return updated;
    },
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
    mutationFn: async ({ cardIds, patcher }) => {
      if (cardIds.length === 0) return [];
      const cached = qc.getQueryData<readonly Card[]>(queryKeys.cards.all());
      const byId = new Map<string, Card>();
      if (cached) for (const c of cached) byId.set(c.id, c);
      const missing = cardIds.filter((id) => !byId.has(id));
      if (missing.length > 0) {
        const rows = await getCardsByIds(missing);
        for (const r of rows) if (r) byId.set(r.id, r);
      }
      const now = Date.now();
      const updated: Card[] = [];
      for (const id of cardIds) {
        const cur = byId.get(id);
        if (!cur) continue;
        updated.push({ ...patcher(cur), updatedAt: now });
      }
      if (updated.length > 0) await bulkPutCardsDirect(updated);
      return updated;
    },
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
    onSettled: settle,
  });

  return { save, remove, bulkUpsert, gradeSection, bulkPatch };
}
