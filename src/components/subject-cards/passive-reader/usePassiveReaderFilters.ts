import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubcategoryNode } from "@/lib/db-types";
import { readCached, writeCached } from "@/lib/settings-cache";

const FILTER_STORAGE_PREFIX = "passive-reader-filters:";

export type TypeFilter = "all" | "essay" | "flash";

interface PersistedFilters {
  subFilter: string;
  chapterFilter: string;
  typeFilter: TypeFilter;
}

const DEFAULTS: PersistedFilters = {
  subFilter: "all",
  chapterFilter: "all",
  typeFilter: "all",
};

function load(categoryId: string): PersistedFilters {
  if (!categoryId) return DEFAULTS;
  const v = readCached<PersistedFilters>(FILTER_STORAGE_PREFIX + categoryId, DEFAULTS);
  const tf = v.typeFilter;
  return {
    subFilter: typeof v.subFilter === "string" ? v.subFilter : "all",
    chapterFilter: typeof v.chapterFilter === "string" ? v.chapterFilter : "all",
    typeFilter: tf === "essay" || tf === "flash" ? tf : "all",
  };
}

export interface PassiveReaderFiltersAPI extends PersistedFilters {
  setSubFilter: (v: string) => void;
  setChapterFilter: (v: string) => void;
  setTypeFilter: (v: TypeFilter) => void;
  resetAll: () => void;
}

export function usePassiveReaderFilters(
  categoryId: string,
  subcategoryNodes: SubcategoryNode[],
): PassiveReaderFiltersAPI {
  const [subFilter, setSubFilter] = useState<string>(() => load(categoryId).subFilter);
  const [chapterFilter, setChapterFilter] = useState<string>(() => load(categoryId).chapterFilter);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => load(categoryId).typeFilter);

  // Drop stale taxonomy ids.
  useEffect(() => {
    if (subFilter !== "all" && !subcategoryNodes.some(s => s.id === subFilter)) {
      setSubFilter("all");
      setChapterFilter("all");
      return;
    }
    if (chapterFilter !== "all") {
      const sub = subcategoryNodes.find(s => s.id === subFilter);
      const valid = sub?.chapters?.some(ch => ch.id === chapterFilter) ?? false;
      if (!valid) setChapterFilter("all");
    }
  }, [subcategoryNodes, subFilter, chapterFilter]);

  // Persist.
  useEffect(() => {
    if (!categoryId) return;
    writeCached(FILTER_STORAGE_PREFIX + categoryId, { subFilter, chapterFilter, typeFilter });
  }, [categoryId, subFilter, chapterFilter, typeFilter]);

  const resetAll = useCallback(() => {
    setSubFilter("all");
    setChapterFilter("all");
    setTypeFilter("all");
  }, []);

  return useMemo<PassiveReaderFiltersAPI>(() => ({
    subFilter,
    chapterFilter,
    typeFilter,
    setSubFilter,
    setChapterFilter,
    setTypeFilter,
    resetAll,
  }), [subFilter, chapterFilter, typeFilter, resetAll]);
}
