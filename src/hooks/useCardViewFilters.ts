import { useState, useCallback, useMemo } from "react";
import { getCardMasteryLevel } from "@/lib/mastery";
import { type Card } from "@/lib/spaced-repetition";
import { type CategoryRecord } from "@/lib/db";

interface UseCardViewFiltersParams {
  cards: Card[];
  allCategories: CategoryRecord[];
  categoryId: string;
  masteryFilter?: number | null;
  onClearMasteryFilter?: () => void;
  /** External text search applied across question + section content. */
  externalQuery?: string;
  /** External "filter by linked source" — value of card.sourceId, or "__all__". */
  externalSourceId?: string;
}

export function useCardViewFilters({
  cards,
  allCategories,
  categoryId,
  masteryFilter,
  onClearMasteryFilter,
  externalQuery,
  externalSourceId,
}: UseCardViewFiltersParams) {
  const [filterSubcategory, setFilterSubcategory] = useState<string>("__all__");
  const [filterChapter, setFilterChapter] = useState<string>("__all__");
  const [filterType, setFilterType] = useState<"all" | "essay" | "flash" | "mnemonic">("all");
  const [filterTag, setFilterTag] = useState<string>("__all__");

  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    const catRec = allCategories.find(c => c.id === categoryId);
    if (catRec) {
      for (const sub of catRec.subcategories ?? []) {
        m[sub.id] = sub.name;
        for (const ch of sub.chapters ?? []) m[ch.id] = ch.name;
      }
    }
    return m;
  }, [allCategories, categoryId]);

  const subcategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => { if (c.subcategoryId) counts[c.subcategoryId] = (counts[c.subcategoryId] || 0) + 1; });
    return counts;
  }, [cards]);

  const uniqueSubcategories = useMemo(() => {
    return Object.keys(subcategoryCounts).sort((a, b) => (nameMap[a] ?? a).localeCompare(nameMap[b] ?? b));
  }, [subcategoryCounts, nameMap]);

  const chapterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => {
      if (filterSubcategory !== "__all__" && c.subcategoryId !== filterSubcategory) return;
      if (c.chapterId) counts[c.chapterId] = (counts[c.chapterId] || 0) + 1;
    });
    return counts;
  }, [cards, filterSubcategory]);

  const uniqueChapters = useMemo(() => {
    return Object.keys(chapterCounts).sort((a, b) => (nameMap[a] ?? a).localeCompare(nameMap[b] ?? b));
  }, [chapterCounts, nameMap]);

  const normalizedQuery = (externalQuery ?? "").trim().toLowerCase();
  const sourceFilter = externalSourceId && externalSourceId !== "__all__" ? externalSourceId : null;

  const filteredCards = useMemo(() => {
    return cards.filter(c => {
      if (masteryFilter !== null && masteryFilter !== undefined && getCardMasteryLevel(c) !== masteryFilter) return false;
      if (filterSubcategory !== "__all__" && (c.subcategoryId || "") !== filterSubcategory) return false;
      if (filterChapter !== "__all__" && (c.chapterId || "") !== filterChapter) return false;
      if (filterType === "essay" && c.type !== "essay") return false;
      if (filterType === "flash" && c.type !== "flash") return false;
      if (filterType === "mnemonic" && !(c.tags?.includes("mnemonic"))) return false;
      if (filterTag !== "__all__" && !(c.tags?.includes(filterTag))) return false;
      if (sourceFilter && (c.sourceId ?? "") !== sourceFilter) return false;
      if (normalizedQuery) {
        const hay =
          (c.question ?? "").toLowerCase() +
          " " +
          (c.sections ?? []).map(s => `${s.title ?? ""} ${s.content ?? ""}`).join(" ").toLowerCase() +
          " " +
          (c.tags ?? []).join(" ").toLowerCase();
        if (!hay.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }, [cards, filterSubcategory, filterChapter, filterType, filterTag, masteryFilter, sourceFilter, normalizedQuery]);

  const hasActiveFilters =
    filterSubcategory !== "__all__" ||
    filterChapter !== "__all__" ||
    filterType !== "all" ||
    filterTag !== "__all__" ||
    (masteryFilter !== null && masteryFilter !== undefined) ||
    Boolean(sourceFilter) ||
    Boolean(normalizedQuery);

  const resetFilters = useCallback(() => {
    setFilterSubcategory("__all__");
    setFilterChapter("__all__");
    setFilterType("all");
    setFilterTag("__all__");
    onClearMasteryFilter?.();
  }, [onClearMasteryFilter]);

  const changeSubcategory = useCallback((v: string) => {
    setFilterSubcategory(v);
    setFilterChapter("__all__");
  }, []);

  return {
    filterSubcategory, changeSubcategory,
    filterChapter, setFilterChapter,
    filterType, setFilterType,
    filterTag, setFilterTag,
    nameMap, subcategoryCounts, uniqueSubcategories,
    chapterCounts, uniqueChapters,
    filteredCards, hasActiveFilters, resetFilters,
  };
}
