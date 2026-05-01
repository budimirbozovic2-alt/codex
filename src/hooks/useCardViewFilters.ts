/**
 * Stateful filter orchestrator for the per-category "Pregled i Uređivanje"
 * (CardViewMode) view. Owns subcategory/chapter/type/tag filter state, exposes
 * setters, derived counts, hasActiveFilters, and the filtered+sorted card list.
 *
 * `masteryFilter` and `externalQuery` / `externalSourceId` are passed through
 * from the parent (the parent owns those because they're shared with the
 * mastery dial / search bar that live outside the view).
 */
import { useCallback, useMemo, useState } from "react";
import { type Card } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";
import {
  buildHierarchyOrder,
  compareCardsByHierarchy,
  EMPTY_HIERARCHY_ORDER,
} from "@/lib/card-ordering";
import { getCardMasteryLevel } from "@/lib/mastery";

export type FilterTypeValue = "all" | "essay" | "flash" | "mnemonic";

interface UseCardViewFiltersParams {
  cards: Card[];
  allCategories: CategoryRecord[];
  categoryId: string;
  masteryFilter?: number | null;
  onClearMasteryFilter?: () => void;
  externalQuery?: string;
  externalSourceId?: string;
  /** Initial filter values (used to restore state after edit-and-return). */
  initialSubcategory?: string;
  initialChapter?: string;
  initialType?: FilterTypeValue;
  initialTag?: string | null;
}

const ALL = "__all__";

function matchesType(card: Card, t: FilterTypeValue): boolean {
  if (t === "all") return true;
  if (t === "mnemonic") return card.type === "flash" && Array.isArray(card.tags) && card.tags.includes("mnemonic");
  return card.type === t;
}

export function useCardViewFilters({
  cards,
  allCategories,
  categoryId,
  masteryFilter,
  onClearMasteryFilter,
  externalQuery,
  externalSourceId,
  initialSubcategory,
  initialChapter,
  initialType,
  initialTag,
}: UseCardViewFiltersParams) {
  const [filterSubcategory, setFilterSubcategory] = useState<string>(initialSubcategory ?? ALL);
  const [filterChapter, setFilterChapter] = useState<string>(initialChapter ?? ALL);
  const [filterType, setFilterType] = useState<FilterTypeValue>(initialType ?? "all");
  const [filterTag, setFilterTag] = useState<string | null>(initialTag ?? null);

  const categoryRecord = useMemo(
    () => allCategories.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId],
  );

  // Cards belonging to this category (the view is always category-scoped).
  const scoped = useMemo(
    () => cards.filter((c) => c.categoryId === categoryId),
    [cards, categoryId],
  );

  // Counts for the hierarchy tree (computed on `scoped`, not on filtered).
  const subcategoryCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of scoped) {
      if (c.subcategoryId) m[c.subcategoryId] = (m[c.subcategoryId] ?? 0) + 1;
    }
    return m;
  }, [scoped]);

  const chapterCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of scoped) {
      if (c.chapterId) m[c.chapterId] = (m[c.chapterId] ?? 0) + 1;
    }
    return m;
  }, [scoped]);

  const filteredCards = useMemo(() => {
    const q = (externalQuery ?? "").trim().toLowerCase();
    const hasQuery = q.length > 0;
    const sourceFilterActive = !!externalSourceId && externalSourceId !== ALL;

    const list = scoped.filter((card) => {
      if (filterSubcategory !== ALL && card.subcategoryId !== filterSubcategory) return false;
      if (filterChapter !== ALL && card.chapterId !== filterChapter) return false;
      if (!matchesType(card, filterType)) return false;
      if (filterTag && (!Array.isArray(card.tags) || !card.tags.includes(filterTag))) return false;
      if (sourceFilterActive && card.sourceId !== externalSourceId) return false;
      if (typeof masteryFilter === "number") {
        if (getCardMasteryLevel(card) !== masteryFilter) return false;
      }
      if (hasQuery) {
        const haystack = (card.question ?? "").toLowerCase();
        if (haystack.includes(q)) return true;
        const sectionHit = (card.sections ?? []).some((s) => {
          const t = (s.title ?? "").toLowerCase();
          const c = (s.content ?? "").toLowerCase();
          return t.includes(q) || c.includes(q);
        });
        if (!sectionHit) return false;
      }
      return true;
    });

    const order = categoryRecord ? buildHierarchyOrder(categoryRecord) : EMPTY_HIERARCHY_ORDER;
    return [...list].sort((a, b) => compareCardsByHierarchy(a, b, order));
  }, [scoped, filterSubcategory, filterChapter, filterType, filterTag, externalQuery, externalSourceId, masteryFilter, categoryRecord]);

  const hasActiveFilters = useMemo(
    () =>
      filterSubcategory !== ALL ||
      filterChapter !== ALL ||
      filterType !== "all" ||
      filterTag !== null ||
      typeof masteryFilter === "number" ||
      (!!externalSourceId && externalSourceId !== ALL) ||
      (!!externalQuery && externalQuery.trim().length > 0),
    [filterSubcategory, filterChapter, filterType, filterTag, masteryFilter, externalSourceId, externalQuery],
  );

  /** Selecting a subcategory always resets the chapter scope underneath it. */
  const changeSubcategory = useCallback((id: string) => {
    setFilterSubcategory(id);
    setFilterChapter(ALL);
  }, []);

  const resetFilters = useCallback(() => {
    setFilterSubcategory(ALL);
    setFilterChapter(ALL);
    setFilterType("all");
    setFilterTag(null);
    onClearMasteryFilter?.();
  }, [onClearMasteryFilter]);

  return {
    // values
    filterSubcategory,
    filterChapter,
    filterType,
    filterTag,
    filteredCards,
    subcategoryCounts,
    chapterCounts,
    hasActiveFilters,
    // setters
    setFilterSubcategory,
    setFilterChapter,
    setFilterType,
    setFilterTag,
    changeSubcategory,
    resetFilters,
  };
}
