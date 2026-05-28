import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  loadSources,
  loadSourcesByCategory,
  type Source,
} from "@/lib/sources-storage";
import { queryKeys } from "@/lib/query/keys";

const EMPTY: Source[] = [];

/**
 * SSOT subscription for sources scoped to a single category.
 * PR-7f M1 — TanStack Query read-path; invalidacija dolazi automatski iz
 * `bridges.ts` koji sluša `onSourcesChanged` i invalidira `['sources']`.
 *
 * C1 — `placeholderData: keepPreviousData` keeps the previous category's
 * sources visible while the next category is fetching, preventing flash-
 * to-empty when swapping inside the SourcesTab.
 */
function useCategorySourcesQuery(categoryId: string | undefined) {
  return useQuery({
    queryKey: categoryId
      ? queryKeys.sources.byCategory(categoryId)
      : ["sources", "cat", "__none__"],
    queryFn: () => loadSourcesByCategory(categoryId as string),
    enabled: !!categoryId,
    placeholderData: keepPreviousData,
  });
}

export function useCategorySources(categoryId: string | undefined): Source[] {
  const { data } = useCategorySourcesQuery(categoryId);
  return data ?? EMPTY;
}

/**
 * Status-aware variant for skeleton UI on initial subject load.
 * Pilot ("No more empty blinks") — see .lovable/plan.md.
 */
export function useCategorySourcesWithStatus(
  categoryId: string | undefined,
): { sources: Source[]; isLoading: boolean; isFetching: boolean } {
  const { data, isLoading, isFetching } = useCategorySourcesQuery(categoryId);
  return { sources: data ?? EMPTY, isLoading, isFetching };
}

/**
 * SSOT subscription for ALL sources (used by GlobalSearch).
 * Backed by the module-level cache in sources-storage.ts.
 */
export function useAllSources(enabled: boolean = true): Source[] {
  const { data } = useQuery({
    queryKey: queryKeys.sources.all(),
    queryFn: () => loadSources(),
    enabled,
  });
  return data ?? EMPTY;
}
