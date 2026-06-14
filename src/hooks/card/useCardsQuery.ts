/**
 * PR-E1 — TanStack scoped queries for cards cache.
 *
 * All mutations write directly to SQLite and update
 * TanStack optimistically via onMutate.
 * Invalidation flows through onCardsChanged path.
 * staleTime: Infinity (no automatic refetches).
 *
 * PR-H3 Hardening: Added functional data selectors 
 * to prevent aggressive component re-render cascades.
 */
import { 
  useQuery, 
  useQueries, 
} from "@tanstack/react-query";
import {
  listAllCards,
  cardsByCategory,
  cardsBySource,
  getCardsByIds,
  cardCountByCategory,
  countAllCards,
  getDueCardsFromDb,
  countDueCardsFromDb,
  countDueCardsByCategoryFromDb,
  avgMasteryScoreByCategoryFromDb,
} from "@/lib/db/queries";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";

const EMPTY: readonly Card[] = Object.freeze([]);

/** * Unified query with PR-H3 structural selection support.
 * Allows components to subscribe to narrow data slices.
 */
export function useAllCards<T = readonly Card[]>(
  select?: (data: readonly Card[]) => T
): T {
  const { data } = useQuery({
    queryKey: queryKeys.cards.all(),
    queryFn: listAllCards,
    staleTime: Infinity,
    select: select as (data: readonly Card[]) => unknown,
  });
  return (data ?? EMPTY) as T;
}

/**
 * Internal scoped query shared by category lookups.
 * React-Query dedupes by queryKey automatically.
 */
function useCardsByCategoryQuery(categoryId: string | undefined) {
  return useQuery({
    queryKey: categoryId 
      ? queryKeys.cards.byCategory(categoryId) 
      : ["cards", "cat", "_disabled"],
    queryFn: () => cardsByCategory(categoryId!),
    enabled: !!categoryId,
    staleTime: Infinity,
  });
}

export function useCardsByCategory(
  categoryId: string | undefined
): readonly Card[] {
  const { data } = useCardsByCategoryQuery(categoryId);
  return data ?? EMPTY;
}

/** Status-aware variant for Skeleton loading indicators. */
export function useCardsByCategoryWithStatus(
  categoryId: string | undefined,
): { cards: readonly Card[]; isLoading: boolean; isFetching: boolean } {
  const { data, isLoading, isFetching } = 
    useCardsByCategoryQuery(categoryId);
  return { cards: data ?? EMPTY, isLoading, isFetching };
}

export function useCardsBySource(
  sourceId: string | undefined
): readonly Card[] {
  const { data } = useQuery({
    queryKey: sourceId 
      ? queryKeys.cards.bySource(sourceId) 
      : ["cards", "source", "_disabled"],
    queryFn: () => cardsBySource(sourceId!),
    enabled: !!sourceId,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardById(id: string | undefined | null): Card | null {
  const { data } = useQuery({
    queryKey: id 
      ? (["cards", "byId", id] as const) 
      : (["cards", "byId", "_disabled"] as const),
    // PR-H3 Optimizacija: Poravnat redundantni async omotac
    queryFn: () => getCardsByIds([id!]).then((rows) => rows[0] ?? null),
    enabled: !!id,
    staleTime: Infinity,
  });
  return data ?? null;
}

export function useCardCountByCategory(
  categoryId: string | undefined
): number {
  const { data } = useQuery({
    queryKey: categoryId 
      ? queryKeys.cards.countByCategory(categoryId) 
      : ["cards", "count", "_disabled"],
    queryFn: () => cardCountByCategory(categoryId!),
    enabled: !!categoryId,
    staleTime: Infinity,
  });
  return data ?? 0;
}

/** SQL COUNT(*) — no payload decode. */
export function useCardCountAll(): number {
  const { data } = useQuery({
    queryKey: queryKeys.cards.countAll(),
    queryFn: countAllCards,
    staleTime: Infinity,
  });
  return data ?? 0;
}

/** SQL JOIN due cards — no full-table JSON scan. */
export function useDueCards(limit?: number): readonly Card[] {
  const { data } = useQuery({
    queryKey: [...queryKeys.cards.due(), limit ?? "all"] as const,
    queryFn: () => getDueCardsFromDb(Date.now(), limit ?? 50_000),
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

/** SQL COUNT of due cards for dashboard badges. */
export function useDueCardCount(): number {
  const { data } = useQuery({
    queryKey: queryKeys.cards.countDue(),
    queryFn: () => countDueCardsFromDb(),
    staleTime: Infinity,
  });
  return data ?? 0;
}

/**
 * Per-category rounded average mastery scores via SQL AVG on mastery_score.
 */
export function useCategoryMasteryScores(
  categoryIds: readonly string[],
): Record<string, number> {
  return useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: queryKeys.cards.avgMasteryByCategory(id),
      queryFn: () => avgMasteryScoreByCategoryFromDb(id),
      staleTime: Infinity,
    })),
    combine: (results) => {
      const out: Record<string, number> = {};
      categoryIds.forEach((id, i) => {
        out[id] = results[i]?.data ?? 0;
      });
      return out;
    },
  });
}

/**
 * Per-category due counts via SQL JOIN on card_sections_index.
 * No full-category payload decode.
 */
export function useCategoryDueCounts(
  categoryIds: readonly string[],
): Record<string, number> {
  return useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: queryKeys.cards.countDueByCategory(id),
      queryFn: () => countDueCardsByCategoryFromDb(id),
      staleTime: Infinity,
    })),
    combine: (results) => {
      const out: Record<string, number> = {};
      categoryIds.forEach((id, i) => {
        out[id] = results[i]?.data ?? 0;
      });
      return out;
    },
  });
}

/**
 * PR-F — Batched per-category counts.
 * Returned map identity is stable across renders 
 * when underlying counts are unchanged.
 */
export function useCardCountsByCategoryMap(
  categoryIds: readonly string[],
): Record<string, number> {
  return useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: queryKeys.cards.countByCategory(id),
      queryFn: () => cardCountByCategory(id),
      staleTime: Infinity,
    })),
    combine: (results) => {
      const out: Record<string, number> = {};
      categoryIds.forEach((id, i) => {
        out[id] = results[i]?.data ?? 0;
      });
      return out;
    },
  });
}