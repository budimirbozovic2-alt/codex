/**
 * Filter / sort / search state + derivations for MnemonicWorkshop.
 *
 * Keeps `MnemonicWorkshop.tsx` as a near-pure presentational component.
 * Precomputes a `categoryCounts` Map so the per-pill render is O(1) instead
 * of running `cards.filter(...).length` for every category button on every
 * keystroke.
 */
import { useEffect, useMemo, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  type MnemonicCard,
  type MnemonicStatus,
  loadMajorSystem,
} from "@/features/mnemonic/mnemonic-storage";

export type WorkshopSortKey = "newest" | "status" | "category" | "success";
export type WorkshopStatusFilter = MnemonicStatus | "all";

interface Args {
  cards: MnemonicCard[];
  idToName: Record<string, string>;
}

const STATUS_ORDER: Record<MnemonicStatus, number> = {
  "new": 0,
  "in-workshop": 1,
  "ready": 2,
};

export function useWorkshopFilters({ cards, idToName }: Args) {
  const [filterStatus, setFilterStatus] = useState<WorkshopStatusFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubcategory, setSelectedSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<WorkshopSortKey>("newest");
  const [majorSystem, setMajorSystem] = useState<Record<number, string>>({});
  const debouncedSearch = useDebounce(searchQuery, 300);

  useEffect(() => {
    loadMajorSystem().then(setMajorSystem);
  }, []);

  // Single pass over cards builds tree + per-category count + status counts.
  const { categoryTree, categoryCounts, statusCounts } = useMemo(() => {
    const tree: Record<string, Set<string>> = {};
    const counts = new Map<string, number>();
    const status = { all: cards.length, new: 0, "in-workshop": 0, ready: 0 } as Record<WorkshopStatusFilter, number>;
    for (const c of cards) {
      if (!tree[c.categoryId]) tree[c.categoryId] = new Set();
      if (c.subcategoryId) tree[c.categoryId].add(c.subcategoryId);
      counts.set(c.categoryId, (counts.get(c.categoryId) ?? 0) + 1);
      status[c.mnemonicStatus] = (status[c.mnemonicStatus] ?? 0) + 1;
    }
    return { categoryTree: tree, categoryCounts: counts, statusCounts: status };
  }, [cards]);

  const categories = useMemo(() => Object.keys(categoryTree).sort(), [categoryTree]);

  const subcategories = useMemo(
    () => (selectedCategory ? [...(categoryTree[selectedCategory] || [])].sort() : []),
    [selectedCategory, categoryTree],
  );

  const filtered = useMemo(() => {
    let result = cards;
    if (filterStatus !== "all") result = result.filter((c) => c.mnemonicStatus === filterStatus);
    if (selectedCategory) result = result.filter((c) => c.categoryId === selectedCategory);
    if (selectedSubcategory) result = result.filter((c) => c.subcategoryId === selectedSubcategory);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (c) =>
          c.question.toLowerCase().includes(q) ||
          c.mnemonicVideo.toLowerCase().includes(q) ||
          c.acronym.toLowerCase().includes(q) ||
          c.sections.some((s) => s.content.toLowerCase().includes(q)),
      );
    }
    const sorted = [...result].sort((a, b) => {
      switch (sortBy) {
        case "status":
          return STATUS_ORDER[a.mnemonicStatus] - STATUS_ORDER[b.mnemonicStatus];
        case "category":
          return (
            (idToName[a.categoryId] ?? a.categoryId).localeCompare(idToName[b.categoryId] ?? b.categoryId) ||
            (idToName[a.subcategoryId ?? ""] ?? "").localeCompare(idToName[b.subcategoryId ?? ""] ?? "")
          );
        case "success": {
          const aRate = a.testCount > 0 ? a.successCount / a.testCount : -1;
          const bRate = b.testCount > 0 ? b.successCount / b.testCount : -1;
          return aRate - bRate; // worst first
        }
        default:
          return b.createdAt - a.createdAt; // newest first
      }
    });
    return sorted;
  }, [cards, filterStatus, selectedCategory, selectedSubcategory, debouncedSearch, sortBy, idToName]);

  return {
    // state
    filterStatus,
    setFilterStatus,
    selectedCategory,
    setSelectedCategory,
    selectedSubcategory,
    setSelectedSubcategory,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    debouncedSearch,
    majorSystem,
    // derived
    categories,
    subcategories,
    filtered,
    statusCounts,
    categoryCounts,
  };
}
