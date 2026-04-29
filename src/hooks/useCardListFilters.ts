import { useMemo } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db";
import { buildHierarchyOrder, compareCardsByHierarchy, EMPTY_HIERARCHY_ORDER } from "@/lib/card-ordering";
import type { CardBuckets } from "@/lib/card-buckets";

interface FilterOptions {
  filterCategory: string | null;
  filterSubcategory?: string | null;
  filterChapter?: string | null;
  filterType?: "all" | "essay" | "flash";
  filterTag?: string | null;
  searchQuery?: string;
  /**
   * Category record for hierarchical sort (subcat → chapter → card.sortOrder).
   * When omitted, falls back to flat sortOrder (legacy behaviour).
   */
  categoryRecord?: CategoryRecord | null;
  /**
   * Optional pre-built bucket index. When provided, the initial scope is
   * resolved via O(1) Map lookup on the narrowest available filter
   * (chapter > subcategory > category) instead of a full O(N) scan.
   */
  buckets?: CardBuckets;
}

export function useCardListFilters(cards: Card[], opts: FilterOptions) {
  const {
    filterCategory, filterSubcategory, filterChapter,
    filterType = "all", filterTag, searchQuery = "",
    categoryRecord, buckets,
  } = opts;

  return useMemo(() => {
    // Pick the narrowest available bucket as starting set; remaining filters
    // run over a much smaller array. Falls back to full `cards` when no
    // buckets are passed.
    let result: Card[];
    if (buckets && filterChapter) {
      result = buckets.byChapter.get(filterChapter) ?? [];
      if (filterCategory) result = result.filter(c => c.categoryId === filterCategory);
      if (filterSubcategory && filterSubcategory !== "__none__") {
        result = result.filter(c => c.subcategoryId === filterSubcategory);
      } else if (filterSubcategory === "__none__") {
        result = result.filter(c => !c.subcategoryId);
      }
    } else if (buckets && filterSubcategory && filterSubcategory !== "__none__") {
      result = buckets.bySubcategory.get(filterSubcategory) ?? [];
      if (filterCategory) result = result.filter(c => c.categoryId === filterCategory);
    } else if (buckets && filterCategory) {
      result = buckets.byCategory.get(filterCategory) ?? [];
      if (filterSubcategory === "__none__") result = result.filter(c => !c.subcategoryId);
    } else {
      result = filterCategory ? cards.filter(c => c.categoryId === filterCategory) : cards;
      if (filterSubcategory === "__none__") result = result.filter(c => !c.subcategoryId);
      else if (filterSubcategory) result = result.filter(c => c.subcategoryId === filterSubcategory);
      if (filterChapter) result = result.filter(c => c.chapterId === filterChapter);
    }

    if (filterType !== "all") result = result.filter(c => (c.type || "essay") === filterType);
    if (filterTag) result = result.filter(c => (c.tags || []).includes(filterTag));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const questionMatch = c.question.toLowerCase().includes(q);
        const contentMatch = c.sections.some(s => {
          const plain = s.content.replace(/<[^>]*>/g, "").toLowerCase();
          return plain.includes(q) || s.title.toLowerCase().includes(q);
        });
        return questionMatch || contentMatch;
      });
    }

    // Hierarchical sort: subcat.sortOrder → chapter.sortOrder → card.sortOrder.
    // Without the category record we keep the legacy flat-sortOrder behaviour
    // so callers that don't pass it don't regress.
    const order = categoryRecord ? buildHierarchyOrder(categoryRecord) : EMPTY_HIERARCHY_ORDER;
    result = [...result].sort((a, b) => compareCardsByHierarchy(a, b, order));

    return result;
  }, [cards, filterCategory, filterSubcategory, filterChapter, filterType, filterTag, searchQuery, categoryRecord, buckets]);
}
