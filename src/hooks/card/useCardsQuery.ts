/**
 * PR-E1 — TanStack scoped queries are the SOLE in-memory cache for cards.
 *
 * Prior to PR-E each query had a `seedCardMap()` side-effect that mirrored
 * every fetched row into a Zustand `cardMapStore`. That doubled memory and
 * created a "Dual-State" where sync RAM lookups in `cardMapWrites` could
 * diverge from TanStack data. PR-E removed the Zustand mirror; all
 * mutations now write directly to SQLite via `cards-writes.ts` and update
 * TanStack optimistically via `onMutate`.
 *
 * Invalidation flows through the `onCardsChanged → bridge → invalidate`
 * path (debounced, scope-aware). `staleTime: Infinity` because we never
 * refetch on focus/mount/reconnect.
 */
import { useMemo } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
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
import type { Card } from "@/lib/spaced-repetition";

const EMPTY: readonly Card[] = Object.freeze([]);

/** Unified `['cards','all']` query — also used by aggregates (stats, dueCards). */
export function useAllCards(): readonly Card[] {
  const { data } = useQuery({
    queryKey: queryKeys.cards.all(),
    queryFn: () => listAllCards(),
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

/**
 * Internal scoped query — shared by tuple-returning `useCardsByCategory`
 * and status-aware `useCardsByCategoryWithStatus`. One subscription per
 * call site; React-Query dedupes by queryKey across both.
 */
function useCardsByCategoryQuery(categoryId: string | undefined) {
  return useQuery({
    queryKey: categoryId ? queryKeys.cards.byCategory(categoryId) : ["cards", "cat", "_disabled"],
    queryFn: () => cardsByCategory(categoryId!),
    enabled: !!categoryId,
    staleTime: Infinity,
  });
}

export function useCardsByCategory(categoryId: string | undefined): readonly Card[] {
  const { data } = useCardsByCategoryQuery(categoryId);
  return data ?? EMPTY;
}

/**
 * Status-aware variant for skeleton/Suspense-style loading UI. Returned
 * shape stays narrow on purpose — only the bits CategoryView actually
 * needs. `isLoading` is true ONLY for first fetch (no cached data yet);
 * `isFetching` covers any in-flight refetch.
 */
export function useCardsByCategoryWithStatus(
  categoryId: string | undefined,
): { cards: readonly Card[]; isLoading: boolean; isFetching: boolean } {
  const { data, isLoading, isFetching } = useCardsByCategoryQuery(categoryId);
  return { cards: data ?? EMPTY, isLoading, isFetching };
}

export function useCardsBySubcategory(
  subcategoryId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const { data } = useQuery({
    queryKey: subcategoryId && categoryId
      ? queryKeys.cards.bySubcategory(categoryId, subcategoryId)
      : ["cards", "subcat", "_disabled"],
    queryFn: () => cardsBySubcategory(categoryId!, subcategoryId!),
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
    queryFn: () => cardsByChapter(categoryId!, chapterId!),
    enabled: !!chapterId && !!categoryId,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}

export function useCardsBySource(sourceId: string | undefined): readonly Card[] {
  const { data } = useQuery({
    queryKey: sourceId ? queryKeys.cards.bySource(sourceId) : ["cards", "source", "_disabled"],
    queryFn: () => cardsBySource(sourceId!),
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
      return rows[0] ?? null;
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

/**
 * PR-F — Batched per-category counts as a stable `Record<categoryId, count>`.
 *
 * Replaces the legacy `useCardAggregates().cardCountByCategory` reducer over
 * the full `useAllCards()` array. Each entry is backed by a SQL
 * `SELECT COUNT(*) FROM cards WHERE categoryId = ?` query, cached under
 * `queryKeys.cards.countByCategory(id)` and invalidated by the
 * `onCardsChanged → bridges` flow on every write.
 *
 * Returned map identity is stable across renders when the underlying counts
 * (and id list) are unchanged — safe to pass as a prop.
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
      out[id] = results[i]?.data ?? 0;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, dataKey]);
}
