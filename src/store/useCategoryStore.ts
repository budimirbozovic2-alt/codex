// ─────────────────────────────────────────────────────────────────────────────
// Phase 5B — External category store mirror.
//
// Mirrors `categoryRecords` outside of React context so granular selectors
// can subscribe via `useSyncExternalStore` and re-render ONLY when their
// slice (single category, subcategory list, chapter list) actually changes.
//
// The React-side `CategoryStateProvider` remains the authoritative WRITER
// (it pushes into this mirror via a `useEffect`). External IDB invalidations
// (Phase 5A) also funnel through the same provider setter, so the mirror is
// always populated from a single bridge point.
//
// Reads are O(1) — the store maintains derived index maps (by category id,
// by subcategory id, by chapter id) that are rebuilt once per replace.
// ─────────────────────────────────────────────────────────────────────────────
import { createStore } from "zustand/vanilla";
import { useSyncExternalStore, useRef } from "react";
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db";

interface CategoryIndex {
  records: CategoryRecord[];
  byId: Map<string, CategoryRecord>;
  /** subcategoryId → parent CategoryRecord */
  subParent: Map<string, CategoryRecord>;
  /** subcategoryId → SubcategoryNode */
  subById: Map<string, SubcategoryNode>;
  /** chapterId → ChapterNode */
  chById: Map<string, ChapterNode>;
}

function buildIndex(records: CategoryRecord[]): CategoryIndex {
  const byId = new Map<string, CategoryRecord>();
  const subParent = new Map<string, CategoryRecord>();
  const subById = new Map<string, SubcategoryNode>();
  const chById = new Map<string, ChapterNode>();
  for (const r of records) {
    byId.set(r.id, r);
    for (const s of (r.subcategories ?? [])) {
      subParent.set(s.id, r);
      subById.set(s.id, s);
      for (const c of (s.chapters ?? [])) {
        if (typeof c === "object" && c) chById.set(c.id, c);
      }
    }
  }
  return { records, byId, subParent, subById, chById };
}

const EMPTY: CategoryIndex = buildIndex([]);

export const categoryStore = createStore<CategoryIndex>(() => EMPTY);

/** Replace the entire snapshot. Stable identity check skips no-op writes. */
export function setCategoryStoreRecords(records: CategoryRecord[]): void {
  const current = categoryStore.getState();
  if (current.records === records) return;
  categoryStore.setState(buildIndex(records));
}

/** Synchronous read of the live records array. */
export function getCategoryStoreRecords(): CategoryRecord[] {
  return categoryStore.getState().records;
}

// ── Granular external-store selectors ──────────────────────────────────────

const EMPTY_SUBS: SubcategoryNode[] = Object.freeze([]) as unknown as SubcategoryNode[];
const EMPTY_CHAPS: ChapterNode[] = Object.freeze([]) as unknown as ChapterNode[];

interface SliceCache<S, T> {
  snapshot: S | null;
  key: string | undefined;
  result: T;
}

function useStoreSlice<T>(
  key: string | undefined,
  compute: (idx: CategoryIndex, key: string) => T,
  fallback: T,
): T {
  const cache = useRef<SliceCache<CategoryIndex, T>>({
    snapshot: null, key: undefined, result: fallback,
  });
  return useSyncExternalStore(
    categoryStore.subscribe,
    () => {
      if (!key) return fallback;
      const snap = categoryStore.getState();
      if (cache.current.snapshot === snap && cache.current.key === key) {
        return cache.current.result;
      }
      const next = compute(snap, key);
      // Shallow array equality so unrelated mutations don't break referential
      // stability for subscribers (when arrays — e.g. subcategory lists).
      const prev = cache.current.result;
      const same = Array.isArray(next) && Array.isArray(prev)
        && next.length === (prev as unknown[]).length
        && (next as unknown[]).every((v, i) => v === (prev as unknown[])[i]);
      const out = same ? prev : next;
      cache.current = { snapshot: snap, key, result: out };
      return out;
    },
    () => fallback,
  );
}

/** Single category record by id from the external mirror. */
export function useCategoryFromStore(categoryId: string | undefined): CategoryRecord | undefined {
  return useStoreSlice<CategoryRecord | undefined>(
    categoryId,
    (idx, id) => idx.byId.get(id),
    undefined,
  );
}

/** Sorted subcategory nodes for a parent — re-renders only when this parent's list changes. */
export function useSubcategoriesByParentFromStore(categoryId: string | undefined): SubcategoryNode[] {
  return useStoreSlice<SubcategoryNode[]>(
    categoryId,
    (idx, id) => {
      const cat = idx.byId.get(id);
      if (!cat) return EMPTY_SUBS;
      const subs = [...(cat.subcategories ?? [])];
      subs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return subs;
    },
    EMPTY_SUBS,
  );
}

/** Sorted chapter nodes for a subcategory id (parent inferred via index). */
export function useChaptersBySubcategoryFromStore(subcategoryId: string | undefined): ChapterNode[] {
  return useStoreSlice<ChapterNode[]>(
    subcategoryId,
    (idx, id) => {
      const sub = idx.subById.get(id);
      if (!sub) return EMPTY_CHAPS;
      const chs = [...(sub.chapters ?? [])]
        .filter((c): c is ChapterNode => typeof c === "object" && !!c);
      chs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return chs;
    },
    EMPTY_CHAPS,
  );
}

/** Whole record list — rarely needed; prefer narrow selectors. */
export function useAllCategoryRecordsFromStore(): CategoryRecord[] {
  return useSyncExternalStore(
    categoryStore.subscribe,
    () => categoryStore.getState().records,
    () => EMPTY.records,
  );
}

export function __resetCategoryStoreForTests(): void {
  categoryStore.setState(EMPTY);
}
