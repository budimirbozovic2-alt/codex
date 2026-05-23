import { createContext, useContext, useMemo, useEffect, useCallback, type ReactNode } from "react";
import { useSyncExternalStore } from "react";
import type { CategoryRecord } from "@/lib/db";
import { primeExaminerProfilesFromRecords } from "@/lib/examiner-profile-cache";
import { registerCategoryStateSetter } from "@/lib/repositories/categoryStateInvalidator";
import {
  categoryStore,
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store/useCategoryStore";

// ── Public state (consumed by useCategoryData) ──
interface CategoryStateContextValue {
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
}

const CategoryStateContext = createContext<CategoryStateContextValue | null>(null);

const EMPTY_CATEGORY_STATE: CategoryStateContextValue = {
  categories: [],
  categoryRecords: [],
  subcategories: {},
};

// Public hook for the category list/records/subcategories.
// `categoryStats` lives in `useCategoryStatsData` from CardStateProvider —
// keeping them separate means components that read only the list don't
// re-render when card scores change.
export function useCategoryData() {
  const ctx = useContext(CategoryStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useCategoryData] no provider — returning empty fallback (HMR transient)");
      return EMPTY_CATEGORY_STATE;
    }
    throw new Error("useCategoryData must be used within CategoryStateProvider");
  }
  return ctx;
}

// ── Internal plumbing for action providers ──
// Phase 5C: `setCategoryRecords` is now a SHIM that writes into the external
// `categoryStore` mirror — which is the new SSOT. Action callers don't need
// to change their signature; the underlying mutation just no longer flows
// through React state.
interface CategoryStateInternals {
  setCategoryRecords: React.Dispatch<React.SetStateAction<CategoryRecord[]>>;
  getCategoryRecords: () => CategoryRecord[];
}

const CategoryStateInternalsContext = createContext<CategoryStateInternals | null>(null);

export function useCategoryStateInternals() {
  const ctx = useContext(CategoryStateInternalsContext);
  if (!ctx) throw new Error("useCategoryStateInternals must be used within CategoryStateProvider");
  return ctx;
}

// ── Setter exposed to bootstrap ──
const CategoryStateSetterContext = createContext<React.Dispatch<React.SetStateAction<CategoryRecord[]>> | null>(null);
export function useCategoryStateSetter() {
  const ctx = useContext(CategoryStateSetterContext);
  if (!ctx) throw new Error("useCategoryStateSetter must be used within CategoryStateProvider");
  return ctx;
}

// Stable module-level setter facade — same identity across renders so it
// can be passed as a prop without churning memoisation.
const setCategoryRecordsShim: React.Dispatch<React.SetStateAction<CategoryRecord[]>> = (action) => {
  const prev = getCategoryStoreRecords();
  const next = typeof action === "function"
    ? (action as (p: CategoryRecord[]) => CategoryRecord[])(prev)
    : action;
  if (next === prev) return;
  setCategoryStoreRecords(next);
};

const getRecordsFromStore = (): CategoryRecord[] => getCategoryStoreRecords();

export function CategoryStateProvider({ children }: { children: ReactNode }) {
  // Phase 5C — provider subscribes to the external mirror. The mirror IS the
  // SSOT now; useState is gone. Any writer (action providers, invalidator,
  // bootstrap, restore) pushes to the mirror and this hook re-renders.
  const categoryRecords = useSyncExternalStore(
    categoryStore.subscribe,
    () => categoryStore.getState().records,
    () => categoryStore.getState().records,
  );

  // Derived: UUID list
  const categories = useMemo(() => categoryRecords.map(r => r.id), [categoryRecords]);

  // Derived: subcategory UUID map (sorted by sortOrder)
  const subcategories = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of categoryRecords) {
      const subs = [...(r.subcategories ?? [])];
      subs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      map[r.id] = subs.map((n) => n.id);
    }
    return map;
  }, [categoryRecords]);

  // Prime examiner-profile cache so calculateNextReview never sees undefined.
  useEffect(() => {
    primeExaminerProfilesFromRecords(categoryRecords);
  }, [categoryRecords]);

  // Phase 5A — register the React shim with the invalidator. Strictly
  // redundant in Phase 5C (the invalidator already pushes to the mirror,
  // which re-renders us via subscription) but kept so any future external
  // emitter that bypasses the mirror still has a React-side fan-out.
  useEffect(() => {
    registerCategoryStateSetter((records) => setCategoryStoreRecords(records));
    return () => registerCategoryStateSetter(null);
  }, []);

  const stateValue = useMemo<CategoryStateContextValue>(
    () => ({ categories, categoryRecords, subcategories }),
    [categories, categoryRecords, subcategories],
  );

  const getCategoryRecords = useCallback(getRecordsFromStore, []);
  const internals = useMemo<CategoryStateInternals>(
    () => ({ setCategoryRecords: setCategoryRecordsShim, getCategoryRecords }),
    [getCategoryRecords],
  );

  return (
    <CategoryStateSetterContext.Provider value={setCategoryRecordsShim}>
      <CategoryStateInternalsContext.Provider value={internals}>
        <CategoryStateContext.Provider value={stateValue}>
          {children}
        </CategoryStateContext.Provider>
      </CategoryStateInternalsContext.Provider>
    </CategoryStateSetterContext.Provider>
  );
}
