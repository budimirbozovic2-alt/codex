import { useMemo } from "react";
import type { Card } from "@/lib/spaced-repetition";

interface FilterOptions {
  filterCategory: string | null;
  filterSubcategory?: string | null;
  filterChapter?: string | null;
  filterType?: "all" | "essay" | "flash";
  filterTag?: string | null;
  searchQuery?: string;
}

export function useCardListFilters(cards: Card[], opts: FilterOptions) {
  const { filterCategory, filterSubcategory, filterChapter, filterType = "all", filterTag, searchQuery = "" } = opts;

  return useMemo(() => {
    let result = filterCategory ? cards.filter(c => c.categoryId === filterCategory) : cards;

    if (filterSubcategory === "__none__") result = result.filter(c => !c.subcategoryId);
    else if (filterSubcategory) result = result.filter(c => c.subcategoryId === filterSubcategory);

    if (filterChapter) result = result.filter(c => c.chapterId === filterChapter);
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

    // Sort by sortOrder if available, then createdAt
    result = [...result].sort((a, b) => {
      const aOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.createdAt - b.createdAt;
    });

    return result;
  }, [cards, filterCategory, filterSubcategory, filterChapter, filterType, filterTag, searchQuery]);
}
