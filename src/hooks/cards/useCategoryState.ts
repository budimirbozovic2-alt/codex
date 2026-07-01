/**
 * `useCategoryData` reads from TanStack Query (`useAllCategories`).
 * `useCategoryStateBridge` primes examiner cache on taxonomy changes.
 */
import { useEffect, useMemo, useRef } from "react";
import type { CategoryRecord } from "@/lib/db-types";
import { primeExaminerProfilesFromRecords } from "@/lib/examiner-profile-cache";
import { useAllCategories } from "@/hooks/category/useCategoriesQuery";

interface CategoryStateContextValue {
  categories: string[];
  categoryRecords: CategoryRecord[];
  subcategories: Record<string, string[]>;
}

function buildCategoryState(records: CategoryRecord[]): CategoryStateContextValue {
  const categories = records.map((r) => r.id);
  const subcategories: Record<string, string[]> = {};
  for (const r of records) {
    const subs = [...(r.subcategories ?? [])];
    subs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    subcategories[r.id] = subs.map((n) => n.id);
  }
  return { categories, categoryRecords: records, subcategories };
}

function categoryRecordsShallowEqual(a: CategoryRecord[], b: CategoryRecord[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id
      || left.name !== right.name
      || left.sortOrder !== right.sortOrder
      || (left.subcategories?.length ?? 0) !== (right.subcategories?.length ?? 0)
    ) {
      return false;
    }
  }
  return true;
}

export function useCategoryData(): CategoryStateContextValue {
  const records = useAllCategories() as CategoryRecord[];
  const stableRef = useRef<CategoryStateContextValue>(buildCategoryState([]));

  return useMemo<CategoryStateContextValue>(() => {
    if (categoryRecordsShallowEqual(stableRef.current.categoryRecords, records)) {
      return stableRef.current;
    }
    const next = buildCategoryState(records);
    stableRef.current = next;
    return next;
  }, [records]);
}

/** Mounted once in `AppBootstrap`. Primes examiner cache on taxonomy changes. */
export function useCategoryStateBridge(): void {
  const { categoryRecords } = useCategoryData();
  useEffect(() => {
    primeExaminerProfilesFromRecords(categoryRecords);
  }, [categoryRecords]);
}
