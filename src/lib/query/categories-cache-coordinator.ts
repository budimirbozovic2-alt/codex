/**
 * Authoritative TanStack cache writes for categories taxonomy.
 */
import type { CategoryRecord } from "@/lib/db-types";
import {
  listAllCategories,
  countCategories,
  notifyCategoriesChanged,
} from "@/lib/db/queries";
import { queryClient } from "./client";
import { queryKeys } from "./keys";
import { runAuthoritativeWrite } from "./authoritative-write";

let categoriesCacheWriteGeneration = 0;
let categoriesHydrated = false;
const hydrationListeners = new Set<() => void>();

function emitHydrationChange(): void {
  for (const listener of hydrationListeners) listener();
}

export function resetCategoriesQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.categories.root });
  categoriesHydrated = false;
  emitHydrationChange();
}

export function getCategoriesCacheWriteGeneration(): number {
  return categoriesCacheWriteGeneration;
}

export function getCategoriesHydrated(): boolean {
  return categoriesHydrated;
}

export function subscribeCategoriesHydrated(listener: () => void): () => void {
  hydrationListeners.add(listener);
  return () => hydrationListeners.delete(listener);
}

export function beginCategoriesWrite(): number {
  categoriesCacheWriteGeneration += 1;
  void queryClient.cancelQueries({ queryKey: queryKeys.categories.root });
  return categoriesCacheWriteGeneration;
}

export function seedCategoriesQueryCache(
  records: readonly CategoryRecord[],
  writeGen?: number,
  sqlCount?: number,
): boolean {
  if (writeGen !== undefined && writeGen !== categoriesCacheWriteGeneration) {
    return false;
  }
  queryClient.setQueryData(queryKeys.categories.all(), records);
  queryClient.setQueryData(
    queryKeys.categories.countAll(),
    sqlCount ?? records.length,
  );
  categoriesHydrated = true;
  emitHydrationChange();
  return true;
}

export function commitCategoriesWriteFromRows(
  records: readonly CategoryRecord[],
  writeGen?: number,
): boolean {
  const seeded = seedCategoriesQueryCache(records, writeGen);
  if (seeded) {
    notifyCategoriesChanged({ kind: "all" });
  }
  return seeded;
}

export async function commitCategoriesWriteFromDb(
  writeGen?: number,
): Promise<number> {
  const [records, sqlCount] = await Promise.all([
    listAllCategories(),
    countCategories(),
  ]);
  if (writeGen !== undefined) {
    if (!seedCategoriesQueryCache(records, writeGen, sqlCount)) return -1;
  } else {
    seedCategoriesQueryCache(records, undefined, sqlCount);
  }
  notifyCategoriesChanged({ kind: "all" });
  return sqlCount;
}

export async function abortCategoriesWrite(): Promise<number> {
  return commitCategoriesWriteFromDb();
}

export async function ensureCategoriesBootCache(
  writeGenAtStart: number,
  signal?: AbortSignal,
): Promise<number> {
  if (signal?.aborted) return -1;
  if (writeGenAtStart !== categoriesCacheWriteGeneration) return -1;

  const [records, sqlCount] = await Promise.all([
    listAllCategories(),
    countCategories(),
  ]);

  if (signal?.aborted) return -1;
  if (writeGenAtStart !== categoriesCacheWriteGeneration) return -1;

  queryClient.setQueryData(queryKeys.categories.all(), records);
  queryClient.setQueryData(queryKeys.categories.countAll(), sqlCount);
  categoriesHydrated = true;
  emitHydrationChange();
  return sqlCount;
}

export function getCategoriesFromQueryCache(): readonly CategoryRecord[] {
  return (
    queryClient.getQueryData<readonly CategoryRecord[]>(
      queryKeys.categories.all(),
    ) ?? []
  );
}

export async function runAuthoritativeCategoriesWrite<T>(
  work: (generation: number) => Promise<T>,
): Promise<T> {
  return runAuthoritativeWrite(
    beginCategoriesWrite,
    (gen) => commitCategoriesWriteFromDb(gen),
    () => abortCategoriesWrite(),
    work,
  );
}

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.accept(() => {
    resetCategoriesQueryCache();
  });
}
