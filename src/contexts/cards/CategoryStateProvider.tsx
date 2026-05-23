/**
 * Category state — Provider je uklonjen; `useCategoryData` čita direktno iz
 * Zustand `categoryStore` preko `useSyncExternalStore`. Side-effect bridge
 * (`primeExaminerProfilesFromRecords`, `registerCategoryStateSetter`)
 * montira se kao `useCategoryStateBridge()` hook unutar `CardProvider`-a.
 *
 * Re-export `CategoryStateProvider` no-op shim postoji samo radi backwards
 * kompatibilnosti — može se ukloniti čim svi pozivaoci skinu wrapper.
 */
import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { CategoryRecord } from "@/lib/db";
import { primeExaminerProfilesFromRecords } from "@/lib/examiner-profile-cache";
import { registerCategoryStateSetter } from "@/lib/repositories";
import {
  categoryStore,
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store";

interface CategoryStateContextValue {
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
}

function getRecords(): CategoryRecord[] {
  return categoryStore.getState().records;
}

// ── Hook: subscribes to Zustand store, returns memoised derived view ──
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

// ── Module-level setter facade (stable identity across renders) ──
export const setCategoryRecordsShim: React.Dispatch<React.SetStateAction<CategoryRecord[]>> = (action) => {
  const prev = getCategoryStoreRecords();
  const next = typeof action === "function"
    ? (action as (p: CategoryRecord[]) => CategoryRecord[])(prev)
    : action;
  if (next === prev) return;
  setCategoryStoreRecords(next);
};

const _internals = {
  setCategoryRecords: setCategoryRecordsShim,
  getCategoryRecords: getCategoryStoreRecords,
} as const;

export function useCategoryStateInternals() {
  return _internals;
}

export function useCategoryStateSetter() {
  return setCategoryRecordsShim;
}

/**
 * Bridge hook — montira se jednom (npr. u `CardProvider`) i drži dva
 * side-effect-a koja su ranije živjela u `<CategoryStateProvider>`:
 *  1. examiner-profile cache prime na svaku promjenu records-a
 *  2. registracija React-side fan-out shim-a za invalidator (defensivno)
 */
export function useCategoryStateBridge(): void {
  const { categoryRecords } = useCategoryData();

  useEffect(() => {
    primeExaminerProfilesFromRecords(categoryRecords);
  }, [categoryRecords]);

  useEffect(() => {
    registerCategoryStateSetter((records) => setCategoryStoreRecords(records));
    return () => registerCategoryStateSetter(null);
  }, []);
}

/** @deprecated Provider je uklonjen; ostaje no-op shim radi backwards kompat. */
export function CategoryStateProvider({ children }: { children: ReactNode }) {
  // No-op: state izvor je Zustand `categoryStore`. Bridge montira CardProvider.
  return <>{children}</>;
}
