// ─────────────────────────────────────────────────────────────────────────────
// Phase 5A + 5B — Granular category selectors.
//
// 5A: introduced these hooks layered over the React context.
// 5B: re-routed to the **external** `categoryStore` mirror so a component
//     that cares about ONE category does NOT re-render when an unrelated
//     category mutates (context value identity changes invalidate every
//     consumer; external-store subscription does not).
//
// Public API is unchanged — existing call sites keep working.
// ─────────────────────────────────────────────────────────────────────────────
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db";
import {
  useCategoryFromStore,
  useSubcategoriesByParentFromStore,
  useChaptersBySubcategoryFromStore,
} from "@/store/useCategoryStore";

/** Single category record by id. Stable reference between mutations of others. */
export function useCategory(categoryId: string | undefined): CategoryRecord | undefined {
  return useCategoryFromStore(categoryId);
}

/** Sorted subcategory nodes for a parent. Empty array when not found. */
export function useSubcategoriesByParent(categoryId: string | undefined): SubcategoryNode[] {
  return useSubcategoriesByParentFromStore(categoryId);
}

/** Sorted chapter nodes for a (category, subcategory) pair. */
export function useChaptersBySubcategory(
  _categoryId: string | undefined,
  subcategoryId: string | undefined,
): ChapterNode[] {
  // categoryId kept in the signature for backwards-compat; the external store
  // resolves chapters by subcategoryId alone via its parent-index map.
  void _categoryId;
  return useChaptersBySubcategoryFromStore(subcategoryId);
}
