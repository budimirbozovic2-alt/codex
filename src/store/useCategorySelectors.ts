// ─────────────────────────────────────────────────────────────────────────────
// Phase 5A + 5B — Granular category selectors.
// Phase 6 — Branded ID parameter types (CategoryIdLike, SubcategoryIdLike).
//
// 5A: introduced these hooks layered over the React context.
// 5B: re-routed to the **external** `categoryStore` mirror so a component
//     that cares about ONE category does NOT re-render when an unrelated
//     category mutates (context value identity changes invalidate every
//     consumer; external-store subscription does not).
// 6:  parameter types now use the branded `*IdLike` aliases from `@/lib/ids`
//     so callers that have already gone through `asCategoryId(...)` carry
//     the brand through to downstream code, while plain-string call sites
//     continue to compile unchanged.
//
// Public API is unchanged at runtime — existing call sites keep working.
// ─────────────────────────────────────────────────────────────────────────────
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db-types";
import type { CategoryIdLike, SubcategoryIdLike } from "@/lib/ids";
import {
  useCategoryFromStore,
  useSubcategoriesByParentFromStore,
  useChaptersBySubcategoryFromStore,
} from "@/store/useCategoryStore";

/** Single category record by id. Stable reference between mutations of others. */
export function useCategory(categoryId: CategoryIdLike | undefined): CategoryRecord | undefined {
  return useCategoryFromStore(categoryId);
}

/** Sorted subcategory nodes for a parent. Empty array when not found. */
export function useSubcategoriesByParent(categoryId: CategoryIdLike | undefined): SubcategoryNode[] {
  return useSubcategoriesByParentFromStore(categoryId);
}

/** Sorted chapter nodes for a (category, subcategory) pair. */
export function useChaptersBySubcategory(
  _categoryId: CategoryIdLike | undefined,
  subcategoryId: SubcategoryIdLike | undefined,
): ChapterNode[] {
  // categoryId kept in the signature for backwards-compat; the external store
  // resolves chapters by subcategoryId alone via its parent-index map.
  void _categoryId;
  return useChaptersBySubcategoryFromStore(subcategoryId);
}
