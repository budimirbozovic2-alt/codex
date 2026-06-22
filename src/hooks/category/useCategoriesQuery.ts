/**
 * TanStack read hooks for categories taxonomy.
 */
import { useQuery } from "@tanstack/react-query";
import { listAllCategories, countCategories, getCategory } from "@/lib/db/queries";
import { queryKeys } from "@/lib/query/keys";
import type { CategoryRecord } from "@/lib/db-types";

const EMPTY: readonly CategoryRecord[] = Object.freeze([]);

export function useAllCategories<T = readonly CategoryRecord[]>(
  select?: (data: readonly CategoryRecord[]) => T,
): T {
  const { data } = useQuery({
    queryKey: queryKeys.categories.all(),
    queryFn: listAllCategories,
    staleTime: Infinity,
    select: select as (data: readonly CategoryRecord[]) => unknown,
  });
  return (data ?? EMPTY) as T;
}

export function useCategoryById(id: string | undefined) {
  return useQuery({
    queryKey: id
      ? queryKeys.categories.byId(id)
      : (["categories", "id", "_disabled"] as const),
    queryFn: () => (id ? getCategory(id) : null),
    enabled: Boolean(id),
    staleTime: Infinity,
  });
}

export function useCategoryCountAll(): number {
  const { data } = useQuery({
    queryKey: queryKeys.categories.countAll(),
    queryFn: countCategories,
    staleTime: Infinity,
  });
  return data ?? 0;
}
