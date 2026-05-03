/**
 * Stateful filter orchestrator for the per-category "Pregled i Uređivanje"
 * (CardViewMode) view. Owns subcategory/chapter/type/frequency filter state,
 * exposes setters, derived counts, hasActiveFilters, and the filtered+sorted
 * card list.
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
import type { FrequencyFilterValue } from "@/components/category/CardViewFilterBar";

export type FilterTypeValue = "all" | "essay" | "flash" | "mnemonic";
export type { FrequencyFilterValue };

interface UseCardViewFiltersParams {
  cards: Card[];
  allCategories: CategoryRecord[];
  categoryId: string;
  masteryFilter?: number | null;
  onClearMasteryFilter?: () => void;
  externalQuery?: string;
  /** Initial filter values (used to restore state after edit-and-return). */
  initialSubcategory?: string;
  initialChapter?: string;
  initialType?: FilterTypeValue;
  initialFrequency?: FrequencyFilterValue;
}

const ALL = "__all__";

function matchesType(card: Card, t: FilterTypeValue): boolean {
  if (t === "all") return true;
  if (t === "mnemonic") return card.type === "flash" && Array.isArray(card.tags) && card.tags.includes("mnemonic");
  return card.type === t;
}

function matchesFrequency(card: Card, f: FrequencyFilterValue): boolean {
  if (f === "all") return true;
  if (f === "none") return !card.frequencyTag;
  return card.frequencyTag === f;
}

export function useCardViewFilters({
  cards,
  allCategories,
  categoryId,
  masteryFilter,
  onClearMasteryFilter,
  externalQuery,
  initialSubcategory,
  initialChapter,
  initialType,
  initialFrequency,
}: UseCardViewFiltersParams) {
  const [filterSubcategory, setFilterSubcategory] = useState<string>(initialSubcategory ?? ALL);
  const [filterChapter, setFilterChapter] = useState<string>(initialChapter ?? ALL);
  const [filterType, setFilterType] = useState<FilterTypeValue>(initialType ?? "all");
  const [filterFrequency, setFilterFrequency] = useState<FrequencyFilterValue>(initialFrequency ?? "all");

  const categoryRecord = useMemo(
    () => allCategories.find((c) => c.id === categoryId) ?? null,
    [allCategories, categoryId],
  );

  const scoped = useMemo(
    () => cards.filter((c) => c.categoryId === categoryId),
    [cards, categoryId],
  );

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

    const list = scoped.filter((card) => {
      if (filterSubcategory !== ALL && card.subcategoryId !== filterSubcategory) return false;
      if (filterChapter !== ALL && card.chapterId !== filterChapter) return false;
      if (!matchesType(card, filterType)) return false;
      if (!matchesFrequency(card, filterFrequency)) return false;
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
  }, [scoped, filterSubcategory, filterChapter, filterType, filterFrequency, externalQuery, masteryFilter, categoryRecord]);

  const hasActiveFilters = useMemo(
    () =>
      filterSubcategory !== ALL ||
      filterChapter !== ALL ||
      filterType !== "all" ||
      filterFrequency !== "all" ||
      typeof masteryFilter === "number" ||
      (!!externalQuery && externalQuery.trim().length > 0),
    [filterSubcategory, filterChapter, filterType, filterFrequency, masteryFilter, externalQuery],
  );

  const changeSubcategory = useCallback((id: string) => {
    setFilterSubcategory(id);
    setFilterChapter(ALL);
  }, []);

  const resetFilters = useCallback(() => {
    setFilterSubcategory(ALL);
    setFilterChapter(ALL);
    setFilterType("all");
    setFilterFrequency("all");
    onClearMasteryFilter?.();
  }, [onClearMasteryFilter]);

  return {
    filterSubcategory,
    filterChapter,
    filterType,
    filterFrequency,
    filteredCards,
    subcategoryCounts,
    chapterCounts,
    hasActiveFilters,
    setFilterSubcategory,
    setFilterChapter,
    setFilterType,
    setFilterFrequency,
    changeSubcategory,
    resetFilters,
  };
}
