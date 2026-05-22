// ─────────────────────────────────────────────────────────────────────────────
// Phase 5A — Granular category selectors.
//
// Tiny hooks layered on `useCategoryData()`. They memoise their narrow slice
// so a component that only cares about ONE category (or the subcategories of
// ONE parent) does not re-render when an unrelated category mutates.
//
// Re-render savings come from the `useMemo` referential stability: even
// though `categoryRecords` is recreated on every commit, the slice returned
// here only changes when the slice's own bytes change.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db";
import { useCategoryData } from "@/contexts/cards/CategoryStateProvider";

/** Single category record by id. Stable reference between mutations of others. */
export function useCategory(categoryId: string | undefined): CategoryRecord | undefined {
  const { categoryRecords } = useCategoryData();
  return useMemo(
    () => categoryRecords.find(r => r.id === categoryId),
    [categoryRecords, categoryId],
  );
}

/** Sorted subcategory nodes for a parent. Empty array when not found. */
export function useSubcategoriesByParent(categoryId: string | undefined): SubcategoryNode[] {
  const cat = useCategory(categoryId);
  return useMemo(() => {
    const subs = [...(cat?.subcategories ?? [])];
    subs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return subs;
  }, [cat]);
}

/** Sorted chapter nodes for a (category, subcategory) pair. */
export function useChaptersBySubcategory(
  categoryId: string | undefined,
  subcategoryId: string | undefined,
): ChapterNode[] {
  const subs = useSubcategoriesByParent(categoryId);
  return useMemo(() => {
    const sub = subs.find(s => s.id === subcategoryId);
    const chs = [...(sub?.chapters ?? [])].filter((c): c is ChapterNode => typeof c === "object");
    chs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return chs;
  }, [subs, subcategoryId]);
}
