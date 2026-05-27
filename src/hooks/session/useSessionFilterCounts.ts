/**
 * Pre-computed counts and name maps for SessionFilters.
 *
 * Replaces inline `cards.filter(...).length` calls in the render path with
 * O(1) Map lookups. Walks the cards array exactly once per change, building
 * per-category and per-(category|sub|chapter) counters.
 */
import { useMemo } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord, ChapterNode } from "@/lib/db";
import type { FrequencyTag } from "@/lib/sr/types";

interface Args {
  cards: Card[];
  categoryRecords?: CategoryRecord[];
  selectedCategory: string | null;
  selectedSubcategory: string | null;
  selectedChapter: string | null;
  filterType: "all" | "essay" | "flash";
  filterExamFrequent: boolean;
  tripleMode: boolean;
  frequencyFilter?: "all" | FrequencyTag;
}

export interface SessionFilterCounts {
  subNameMap: Record<string, string>;
  chapterPosMap: Record<string, number>;
  /** O(1) lookup per categoryId — replaces inline cards.filter() in pills. */
  categoryCounts: Map<string, number>;
  /** Chapter UUIDs that appear in cards for the currently selected (cat, sub). */
  chaptersInSub: string[];
  /** Count after applying all active filters. */
  filteredCount: number;
}

export function useSessionFilterCounts({
  cards,
  categoryRecords,
  selectedCategory,
  selectedSubcategory,
  selectedChapter,
  filterType,
  filterExamFrequent,
  tripleMode,
  frequencyFilter,
}: Args): SessionFilterCounts {
  // Names: subcategory + chapter UUID → display name. One pass over taxonomy.
  const subNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of categoryRecords || [])
      for (const n of r.subcategories || []) {
        if (typeof n === "object" && n.id) m[n.id] = n.name;
        for (const ch of n.chapters || [])
          if (typeof ch === "object" && ch.id) m[ch.id] = ch.name;
      }
    return m;
  }, [categoryRecords]);

  const chapterPosMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of categoryRecords || []) {
      for (const sub of r.subcategories || []) {
        if (typeof sub === "object" && sub.chapters) {
          sub.chapters.forEach((ch: ChapterNode | string, i: number) => {
            const id = typeof ch === "string" ? ch : ch.id;
            const order = typeof ch === "string" ? i : ch.sortOrder ?? i;
            m[id] = order;
          });
        }
      }
    }
    return m;
  }, [categoryRecords]);

  // Precompute per-category counts in ONE pass. Used by category pills.
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cards) m.set(c.categoryId, (m.get(c.categoryId) ?? 0) + 1);
    return m;
  }, [cards]);

  const chaptersInSub = useMemo(() => {
    if (!selectedSubcategory) return [];
    const seen = new Set<string>();
    for (const c of cards) {
      if (
        c.categoryId === selectedCategory &&
        c.subcategoryId === selectedSubcategory &&
        c.chapterId
      ) {
        seen.add(c.chapterId);
      }
    }
    return [...seen].sort((a, b) => (chapterPosMap[a] ?? 999) - (chapterPosMap[b] ?? 999));
  }, [cards, selectedCategory, selectedSubcategory, chapterPosMap]);

  const filteredCount = useMemo(() => {
    let n = 0;
    for (const c of cards) {
      if (selectedCategory && c.categoryId !== selectedCategory) continue;
      if (selectedSubcategory && c.subcategoryId !== selectedSubcategory) continue;
      if (selectedChapter && c.chapterId !== selectedChapter) continue;
      if (filterType === "essay" && c.type !== "essay") continue;
      if (filterType === "flash" && c.type !== "flash") continue;
      if (tripleMode) {
        if (frequencyFilter && frequencyFilter !== "all" && c.frequencyTag !== frequencyFilter) continue;
      } else if (filterExamFrequent) {
        if (c.frequencyTag !== "često") continue;
      }
      n++;
    }
    return n;
  }, [
    cards,
    selectedCategory,
    selectedSubcategory,
    selectedChapter,
    filterType,
    filterExamFrequent,
    tripleMode,
    frequencyFilter,
  ]);

  return { subNameMap, chapterPosMap, categoryCounts, chaptersInSub, filteredCount };
}
