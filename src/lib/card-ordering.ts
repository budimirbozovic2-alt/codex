/**
 * Centralized hierarchical ordering for flat card lists.
 *
 * The "Pregled i Uređivanje" (CardViewMode) and CardList views must show
 * cards in the same order the user defined inside Struktura/Raspored
 * (CardOrgMode). That ordering is hierarchical:
 *
 *   subcategory.sortOrder → chapter.sortOrder → card.sortOrder → createdAt → id
 *
 * Sorting only by `card.sortOrder` is wrong because CardOrgMode resets that
 * counter to 0..N **per chapter** — so two cards in different chapters can
 * collide on `sortOrder=0` and interleave non-deterministically.
 *
 * Cards whose subcategoryId / chapterId is unknown (or missing) are pushed
 * to the end of their respective group via MAX_SAFE_INTEGER fallbacks.
 */
import type { Card } from "./spaced-repetition";
import type { CategoryRecord } from "./db";

const TAIL = Number.MAX_SAFE_INTEGER;

export interface HierarchyOrder {
  /** subcategoryId → its sortOrder in the category. Missing IDs sort to the tail. */
  subOrder: Map<string, number>;
  /** chapterId → its sortOrder in its parent subcategory. Missing IDs sort to the tail. */
  chapterOrder: Map<string, number>;
}

/** Empty order — every lookup returns the tail fallback. Useful as default. */
export const EMPTY_HIERARCHY_ORDER: HierarchyOrder = {
  subOrder: new Map(),
  chapterOrder: new Map(),
};

/**
 * Build a fast lookup map from a category record's nested subcategory/chapter
 * structure. Tolerates legacy string entries (treated as missing — they fall
 * to the tail, which preserves their historical insertion order via the
 * createdAt tie-breaker).
 */
export function buildHierarchyOrder(category: CategoryRecord | null | undefined): HierarchyOrder {
  const subOrder = new Map<string, number>();
  const chapterOrder = new Map<string, number>();
  if (!category?.subcategories) return { subOrder, chapterOrder };

  category.subcategories.forEach((sub, si) => {
    if (typeof sub === "string") return; // legacy — no UUID, no order
    const subSort = typeof sub.sortOrder === "number" ? sub.sortOrder : si;
    subOrder.set(sub.id, subSort);
    (sub.chapters ?? []).forEach((ch, ci) => {
      if (typeof ch === "string") return;
      const chSort = typeof ch.sortOrder === "number" ? ch.sortOrder : ci;
      chapterOrder.set(ch.id, chSort);
    });
  });

  return { subOrder, chapterOrder };
}

/**
 * Total comparator for two cards relative to a HierarchyOrder. Stable across
 * runs (deterministic tie-breakers down to `id`).
 */
export function compareCardsByHierarchy(a: Card, b: Card, order: HierarchyOrder): number {
  const aSub = a.subcategoryId ? order.subOrder.get(a.subcategoryId) ?? TAIL : TAIL;
  const bSub = b.subcategoryId ? order.subOrder.get(b.subcategoryId) ?? TAIL : TAIL;
  if (aSub !== bSub) return aSub - bSub;

  const aCh = a.chapterId ? order.chapterOrder.get(a.chapterId) ?? TAIL : TAIL;
  const bCh = b.chapterId ? order.chapterOrder.get(b.chapterId) ?? TAIL : TAIL;
  if (aCh !== bCh) return aCh - bCh;

  const aCard = typeof a.sortOrder === "number" ? a.sortOrder : TAIL;
  const bCard = typeof b.sortOrder === "number" ? b.sortOrder : TAIL;
  if (aCard !== bCard) return aCard - bCard;

  const aT = a.createdAt ?? 0;
  const bT = b.createdAt ?? 0;
  if (aT !== bT) return aT - bT;

  return a.id.localeCompare(b.id);
}
