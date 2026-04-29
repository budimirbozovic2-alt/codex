/**
 * Memoized in-memory bucket index over `Card[]`, mirroring the v15 IDB
 * indexes (`chapterId`, `[categoryId+chapterId]`, `[subcategoryId+chapterId]`)
 * but for the in-memory `cardMap` SSOT used in render paths.
 *
 * Why: the project keeps the full card list in memory (per the SSOT rule —
 * no useLiveQuery in primary views), so Dexie indexes don't help filters
 * that operate on the already-loaded array. Pre-bucketing turns repeated
 * O(N) `cards.filter(c => c.categoryId === X)` calls into O(1) Map lookup
 * + O(K) iteration where K is the bucket size, which collapses dashboard
 * and review-setup re-render times for users with thousands of cards.
 *
 * Build is a single O(N) pass; consumers should memoize via `useMemo`.
 */

import type { Card } from "./spaced-repetition";

export interface CardBuckets {
  /** All cards belonging to a categoryId. */
  byCategory: Map<string, Card[]>;
  /** All cards belonging to a subcategoryId (across all categories — UUIDs are unique). */
  bySubcategory: Map<string, Card[]>;
  /** All cards belonging to a chapterId. */
  byChapter: Map<string, Card[]>;
  /** Cards keyed by `${categoryId}::${chapterId}`. */
  byCategoryChapter: Map<string, Card[]>;
  /** Cards keyed by `${subcategoryId}::${chapterId}`. */
  bySubcategoryChapter: Map<string, Card[]>;
}

/** Composite key helper — keep callers stable across modules. */
export const compositeKey = (a: string, b: string): string => `${a}::${b}`;

/** Empty buckets singleton — safe to use as a default in consumer `?? EMPTY_BUCKETS`. */
export const EMPTY_BUCKETS: CardBuckets = Object.freeze({
  byCategory: new Map(),
  bySubcategory: new Map(),
  byChapter: new Map(),
  byCategoryChapter: new Map(),
  bySubcategoryChapter: new Map(),
}) as CardBuckets;

function pushTo<K>(map: Map<K, Card[]>, key: K, card: Card): void {
  const existing = map.get(key);
  if (existing) existing.push(card);
  else map.set(key, [card]);
}

/**
 * Single-pass bucket builder. Returns fresh Map instances every call so
 * referential equality is a reliable rebuild signal for React.
 *
 * Cards missing `categoryId`, `subcategoryId`, or `chapterId` are simply
 * not inserted into the corresponding bucket — consumers that need to
 * surface "untagged" rows must continue handling that case explicitly
 * (the existing convention in `useSourceHierarchy` is the `__ostalo__`
 * sentinel; this util preserves that contract by omission).
 */
export function buildCardBuckets(cards: Card[]): CardBuckets {
  const byCategory = new Map<string, Card[]>();
  const bySubcategory = new Map<string, Card[]>();
  const byChapter = new Map<string, Card[]>();
  const byCategoryChapter = new Map<string, Card[]>();
  const bySubcategoryChapter = new Map<string, Card[]>();

  for (const card of cards) {
    if (card.categoryId) pushTo(byCategory, card.categoryId, card);
    if (card.subcategoryId) pushTo(bySubcategory, card.subcategoryId, card);
    if (card.chapterId) {
      pushTo(byChapter, card.chapterId, card);
      if (card.categoryId) pushTo(byCategoryChapter, compositeKey(card.categoryId, card.chapterId), card);
      if (card.subcategoryId) pushTo(bySubcategoryChapter, compositeKey(card.subcategoryId, card.chapterId), card);
    }
  }

  return { byCategory, bySubcategory, byChapter, byCategoryChapter, bySubcategoryChapter };
}

/** Convenience lookup that returns an empty array (never undefined). */
export function getByCategory(buckets: CardBuckets, categoryId: string | null | undefined): Card[] {
  if (!categoryId) return [];
  return buckets.byCategory.get(categoryId) ?? [];
}
