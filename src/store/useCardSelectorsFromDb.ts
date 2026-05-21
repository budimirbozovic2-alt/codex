// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Dexie liveQuery selectors (IDB-backed `*FromDb` variants).
//
// Each hook subscribes to a Dexie `liveQuery` over an indexed read defined in
// `src/lib/db/queries/cards.ts`. Re-emits when any write touches the matched
// rows. Unbounded categories are capped via `.limit(LIMIT)` to keep render
// budget predictable even on 50k-card datasets.
//
// These run BEHIND `USE_DB_LIVE_SELECTORS`. The hybrid façade in
// `useCardSelectors.ts` decides at session start whether components see the
// RAM path or the IDB path; both implementations always return the same
// shape (stable `readonly Card[]` / number).
// ─────────────────────────────────────────────────────────────────────────────
import { useLiveQuery } from "dexie-react-hooks";
import type { Card } from "@/lib/spaced-repetition";
import {
  cardsByCategory,
  cardsBySubcategory,
  cardsByChapter,
  cardsBySource,
  cardCountByCategory,
} from "@/lib/db/queries/cards";
import { db } from "@/lib/db";

const EMPTY: readonly Card[] = Object.freeze([]);

/** Soft cap for unbounded category reads. Aligns with virtualization budget. */
const CATEGORY_LIMIT = 2_000;

/** Cards in a category (Dexie indexed read). Capped at CATEGORY_LIMIT. */
export function useCardsByCategoryFromDb(
  categoryId: string | undefined,
): readonly Card[] {
  const result = useLiveQuery(
    async () => {
      if (!categoryId) return EMPTY as Card[];
      return db.cards
        .where("categoryId")
        .equals(categoryId)
        .limit(CATEGORY_LIMIT)
        .toArray();
    },
    [categoryId],
    EMPTY as Card[],
  );
  return result ?? EMPTY;
}

/** Cards in a subcategory (composite indexed read). */
export function useCardsBySubcategoryFromDb(
  subcategoryId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const result = useLiveQuery(
    async () => {
      if (!subcategoryId) return EMPTY as Card[];
      // Prefer composite [categoryId+subcategoryId] when scope is known.
      if (categoryId) {
        return cardsBySubcategory(categoryId, subcategoryId);
      }
      return db.cards.where("subcategoryId").equals(subcategoryId).toArray();
    },
    [subcategoryId, categoryId],
    EMPTY as Card[],
  );
  return result ?? EMPTY;
}

/** Cards in a chapter (composite indexed read; requires category scope). */
export function useCardsByChapterFromDb(
  chapterId: string | undefined,
  categoryId?: string,
): readonly Card[] {
  const result = useLiveQuery(
    async () => {
      if (!chapterId) return EMPTY as Card[];
      if (categoryId) return cardsByChapter(categoryId, chapterId);
      return db.cards.where("chapterId").equals(chapterId).toArray();
    },
    [chapterId, categoryId],
    EMPTY as Card[],
  );
  return result ?? EMPTY;
}

/** Cards by source (createdAt-ordered via [sourceId+createdAt]). */
export function useCardsBySourceFromDb(
  sourceId: string | undefined,
): readonly Card[] {
  const result = useLiveQuery(
    async () => {
      if (!sourceId) return EMPTY as Card[];
      return cardsBySource(sourceId);
    },
    [sourceId],
    EMPTY as Card[],
  );
  return result ?? EMPTY;
}

/** Cheap index-only count for badges/headers. */
export function useCardCountByCategoryFromDb(
  categoryId: string | undefined,
): number {
  const result = useLiveQuery(
    async () => {
      if (!categoryId) return 0;
      return cardCountByCategory(categoryId);
    },
    [categoryId],
    0,
  );
  return result ?? 0;
}

/** Single card by id, IDB-backed (rare path — most reads still use cardMapStore). */
export function useCardByIdFromDb(id: string | undefined | null): Card | null {
  const result = useLiveQuery(
    async () => {
      if (!id) return null;
      return (await db.cards.get(id)) ?? null;
    },
    [id],
    null as Card | null,
  );
  return result ?? null;
}
