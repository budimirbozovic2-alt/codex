// ─────────────────────────────────────────────────────────────────────────────
// Phase 5B — External category store mirror.
//
// Mirrors `categoryRecords` outside of React context so granular selectors
// can subscribe via `useSyncExternalStore` and re-render ONLY when their
// slice (single category, subcategory list, chapter list) actually changes.
//
// The React-side `CategoryStateProvider` remains the authoritative WRITER
// (Phase 5A) and also funnels external SQLite invalidations through the same
// bridge point, so the mirror stays populated from a single writer.
//
// Reads are O(1) — the store maintains derived index maps (by category id,
// by subcategory id, by chapter id) that are rebuilt once per replace.
// ─────────────────────────────────────────────────────────────────────────────
import { createStore } from "zustand/vanilla";
import type { CategoryRecord, SubcategoryNode, ChapterNode } from "@/lib/db-types";

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

export function __resetCategoryStoreForTests(): void {
  categoryStore.setState(EMPTY);
}
