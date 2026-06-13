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
import { useMemo } from "react";
import { 
  useQuery, 
  useQueries, 
  type UseQueryResult 
} from "@tanstack/react-query";
import {
  listAllCards,
  cardsByCategory,
  cardsBySource,
  getCardsByIds,
  cardCountByCategory,
  countAllCards,
} from "@/lib/db/queries";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";
import { countDueCards } from "@/hooks/cards/useCardAggregates";

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

/**
 * Per-category due counts via scoped category queries (reuses cached
 * `cardsByCategory` rows when a subject view is already mounted).
 */
export function useCategoryDueCounts(
  categoryIds: readonly string[],
): Record<string, number> {
  const results = useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: queryKeys.cards.byCategory(id),
      queryFn: () => cardsByCategory(id),
      staleTime: Infinity,
    })),
  });

  const idsKey = categoryIds.join("|");
  const dataKey = results.map((r) => r.dataUpdatedAt).join("|");

  return useMemo(() => {
    const out: Record<string, number> = {};
    categoryIds.forEach((id, i) => {
      const cards = (results[i] as UseQueryResult<readonly Card[]> | undefined)
        ?.data ?? EMPTY;
      out[id] = countDueCards(cards);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, dataKey]);
}

/**
 * PR-F — Batched per-category counts.
 * Returned map identity is stable across renders 
 * when underlying counts are unchanged.
 */
export function useCardCountsByCategoryMap(
  categoryIds: readonly string[],
): Record<string, number> {
  const results = useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: queryKeys.cards.countByCategory(id),
      queryFn: () => cardCountByCategory(id),
      staleTime: Infinity,
    })),
  });

  const idsKey = categoryIds.join("|");
  const dataKey = results.map((r) => r.data ?? 0).join("|");

  return useMemo(() => {
    const out: Record<string, number> = {};
    categoryIds.forEach((id, i) => {
      out[id] = (results[i] as UseQueryResult<number> | undefined)
        ?.data ?? 0;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, dataKey]);
}