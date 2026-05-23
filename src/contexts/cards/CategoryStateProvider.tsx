import { createContext, useContext, useMemo, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import type { CategoryRecord } from "@/lib/db";
import { primeExaminerProfilesFromRecords } from "@/lib/examiner-profile-cache";
import { registerCategoryStateSetter } from "@/lib/repositories/categoryStateInvalidator";
import { setCategoryStoreRecords } from "@/store/useCategoryStore";

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

export function CategoryStateProvider({ children }: { children: ReactNode }) {
  const [categoryRecords, setCategoryRecords] = useState<CategoryRecord[]>([]);
  const recordsRef = useRef<CategoryRecord[]>([]);
  recordsRef.current = categoryRecords;

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

  // Phase 5B — mirror records into the external category store so granular
  // selectors (useCategoryFromStore et al.) get per-slice reactivity without
  // re-running on unrelated context updates.
  useEffect(() => {
    setCategoryStoreRecords(categoryRecords);
  }, [categoryRecords]);

  // Phase 5A — expose the React setter to the module-level invalidator so
  // external CATEGORIES_UPDATED emitters (backup restore, cascade, future
  // remote sync) refresh RAM without crossing the React boundary.
  useEffect(() => {
    registerCategoryStateSetter(setCategoryRecords);
    return () => registerCategoryStateSetter(null);
  }, []);

  const stateValue = useMemo<CategoryStateContextValue>(
    () => ({ categories, categoryRecords, subcategories }),
    [categories, categoryRecords, subcategories],
  );

  const getCategoryRecords = useCallback(() => recordsRef.current, []);
  const internals = useMemo<CategoryStateInternals>(
    () => ({ setCategoryRecords, getCategoryRecords }),
    [getCategoryRecords],
  );

  return (
    <CategoryStateSetterContext.Provider value={setCategoryRecords}>
      <CategoryStateInternalsContext.Provider value={internals}>
        <CategoryStateContext.Provider value={stateValue}>
          {children}
        </CategoryStateContext.Provider>
      </CategoryStateInternalsContext.Provider>
    </CategoryStateSetterContext.Provider>
  );
}
