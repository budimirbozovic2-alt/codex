/**
 * Provider Cleanup v2 — `CategoryStateProvider` is a no-op shim and
 * `useCategoryStateInternals` is gone.
 *
 * `useCategoryData` reads from Zustand `categoryStore` via
 * `useSyncExternalStore`. `useCategoryStateBridge` is the one remaining
 * hook with React-lifecycle side-effects (examiner cache prime) — it is
 * mounted exactly once in `<AppBootstrap />`.
 */
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { CategoryRecord } from "@/lib/db-types";
import { primeExaminerProfilesFromRecords } from "@/lib/examiner-profile-cache";
import { categoryStore } from "@/store";

interface CategoryStateContextValue {
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
}

function getRecords(): CategoryRecord[] {
  return categoryStore.getState().records;
}

export function useCategoryData(): CategoryStateContextValue {
  const records = useSyncExternalStore(categoryStore.subscribe, getRecords, getRecords);
  return useMemo<CategoryStateContextValue>(() => {
    const categories = records.map((r) => r.id);
    const subcategories: Record<string, string[]> = {};
    for (const r of records) {
      const subs = [...(r.subcategories ?? [])];
      subs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      subcategories[r.id] = subs.map((n) => n.id);
    }
    return { categories, categoryRecords: records, subcategories };
  }, [records]);
}

/**
 * Bridge hook — mounted once in `AppBootstrap`. Primes examiner cache on
 * each categoryRecords change.
 */
export function useCategoryStateBridge(): void {
  const { categoryRecords } = useCategoryData();
  useEffect(() => {
    primeExaminerProfilesFromRecords(categoryRecords);
  }, [categoryRecords]);
}

/** @deprecated Provider removed in v2 cleanup. Kept as no-op shim. */
export function CategoryStateProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
