/**
 * Phase 2a — Scoped TanStack Query consumers for the cards atom.
 *
 * Every UI selector in `@/store` now delegates here. Reads are TanStack-
 * managed (invalidated via bridge `onCardsChanged → invalidate(['cards'])`).
 * `cardMapStore` remains as an internal write-side cache for
 * `cardMapWrites.patch/remove/clearLinks` synchronous lookups — populated
 * by `select` hook below on every successful query, so any card the UI has
 * fetched is immediately available to sync mutators.
 *
 * `staleTime: Infinity` because invalidation is event-driven (the bridge
 * fires on every cardMap commit). `refetchOnMount: false` would suppress
 * the cascade refetch after invalidation, so we leave the default.
 */
import { useQuery } from "@tanstack/react-query";
import {
  listAllCards,
  cardsByCategory,
  cardsBySubcategory,
  cardsByChapter,
  cardsBySource,
  getCardsByIds,
  cardCountByCategory,
} from "@/lib/db/queries";
import { queryKeys } from "@/lib/query/keys";
import { setCardMap } from "@/store/useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";

const EMPTY: readonly Card[] = Object.freeze([]);

/** Seed loaded rows into the Zustand RAM cache (write-side lookup table). */
function seedCardMap(cards: readonly Card[] | undefined): void {
  if (!cards || cards.length === 0) return;
  setCardMap((prev) => {
    let changed = false;
    let next = prev;
    for (const c of cards) {
      if (prev[c.id] !== c) {
        if (!changed) { next = { ...prev }; changed = true; }
        next[c.id] = c;
      }
    }
    return changed ? next : prev;
  });
}

/** Unified `['cards','all']` query — also used by aggregates (stats, dueCards). */
export function useAllCards(): readonly Card[] {
  const { data } = useQuery({
    queryKey: queryKeys.cards.all(),
    queryFn: async () => {
      const rows = await listAllCards();
      seedCardMap(rows);
      return rows;
    },
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardsByCategory(categoryId: string | undefined): readonly Card[] {
  const { data } = useQuery({
    queryKey: categoryId ? queryKeys.cards.byCategory(categoryId) : ["cards", "cat", "_disabled"],
    queryFn: async () => {
      const rows = await cardsByCategory(categoryId!);
      seedCardMap(rows);
      return rows;
    },
    enabled: !!categoryId,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardsBySubcategory(
  subcategoryId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const { data } = useQuery({
    queryKey: subcategoryId && categoryId
      ? queryKeys.cards.bySubcategory(categoryId, subcategoryId)
      : ["cards", "subcat", "_disabled"],
    queryFn: async () => {
      const rows = await cardsBySubcategory(categoryId!, subcategoryId!);
      seedCardMap(rows);
      return rows;
    },
    enabled: !!subcategoryId && !!categoryId,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardsByChapter(
  chapterId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const { data } = useQuery({
    queryKey: chapterId && categoryId
      ? queryKeys.cards.byChapter(categoryId, chapterId)
      : ["cards", "chap", "_disabled"],
    queryFn: async () => {
      const rows = await cardsByChapter(categoryId!, chapterId!);
      seedCardMap(rows);
      return rows;
    },
    enabled: !!chapterId && !!categoryId,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardsBySource(sourceId: string | undefined): readonly Card[] {
  const { data } = useQuery({
    queryKey: sourceId ? queryKeys.cards.bySource(sourceId) : ["cards", "source", "_disabled"],
    queryFn: async () => {
      const rows = await cardsBySource(sourceId!);
      seedCardMap(rows);
      return rows;
    },
    enabled: !!sourceId,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardById(id: string | undefined | null): Card | null {
  const { data } = useQuery({
    queryKey: id ? ["cards", "byId", id] as const : ["cards", "byId", "_disabled"] as const,
    queryFn: async () => {
      const rows = await getCardsByIds([id!]);
      const card = rows[0] ?? null;
      if (card) seedCardMap([card]);
      return card;
    },
    enabled: !!id,
    staleTime: Infinity,
  });
  return data ?? null;
}

export function useCardCountByCategory(categoryId: string | undefined): number {
  const { data } = useQuery({
    queryKey: categoryId ? queryKeys.cards.countByCategory(categoryId) : ["cards", "count", "_disabled"],
    queryFn: () => cardCountByCategory(categoryId!),
    enabled: !!categoryId,
    staleTime: Infinity,
  });
  return data ?? 0;
}
