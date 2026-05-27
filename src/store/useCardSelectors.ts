// ─────────────────────────────────────────────────────────────────────────────
// PR-7e M1 — RAM-only granular card selectors (single source of truth).
//
// Phase 1 + Phase 2 dual-read façade dismantled. Selectors read from
// `cardMapStore` directly. The Dexie liveQuery siblings + diff harness are
// gone — RAM is committed SSOT now that the Ref-Delta persistence model in
// `cardRepository` keeps the map synchronously consistent with IDB writes.
//
// Indexed Dexie helpers (`cardsByCategory`, etc.) still exist in
// `@/lib/db/queries/cards` for bootstrap loaders and the `useCardsBySource`
// granular selector — only the React-hook fan-out over `liveQuery` was
// removed.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore, useRef } from "react";
import { cardMapStore } from "./useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";
import type { CardMap } from "@/lib/persist-queue";
import type {
  CategoryIdLike,
  SubcategoryIdLike,
  ChapterIdLike,
  CardIdLike,
} from "@/lib/ids";

const EMPTY: readonly Card[] = Object.freeze([]);

interface SelectorCache<K> {
  map: CardMap | null;
  key: K | undefined;
  result: readonly Card[];
}

/**
 * Build a card-set selector hook keyed on a single argument.
 *
 * @param predicate  Per-card matcher. Closes over the hook arg via `key`.
 * @param keyEq      Optional equality for the key (default: strict `===`).
 */
function createCardSetSelector<K>(
  predicate: (card: Card, key: K) => boolean,
  keyEq: (a: K | undefined, b: K | undefined) => boolean = Object.is,
) {
  return function useCardSet(key: K | undefined): readonly Card[] {
    const cache = useRef<SelectorCache<K>>({ map: null, key: undefined, result: EMPTY });

    return useSyncExternalStore(
      cardMapStore.subscribe,
      () => {
        if (key === undefined || key === null || key === ("" as unknown as K)) return EMPTY;
        const map = cardMapStore.getState().cardMap;

        // Same store snapshot + same key → reuse last result.
        if (cache.current.map === map && keyEq(cache.current.key, key)) {
          return cache.current.result;
        }

        const matched: Card[] = [];
        for (const id in map) {
          const c = map[id];
          if (predicate(c, key)) matched.push(c);
        }

        // Shallow-equal vs last result — if every matched card reference is
        // unchanged AND the key is unchanged, return prior array to suppress
        // re-render in pure-rerender scenarios.
        const prev = cache.current.result;
        const same =
          keyEq(cache.current.key, key) &&
          matched.length === prev.length &&
          matched.every((c, i) => c === prev[i]);

        const next = same ? prev : matched;
        cache.current = { map, key, result: next };
        return next;
      },
      () => EMPTY,
    );
  };
}

// ── RAM selectors (public — single implementation) ────────────────────────

export const useCardsByCategoryRam = createCardSetSelector<string>(
  (c, id) => c.categoryId === id,
);
export const useCardsBySubcategoryRam = createCardSetSelector<string>(
  (c, id) => c.subcategoryId === id,
);
export const useCardsByChapterRam = createCardSetSelector<string>(
  (c, id) => c.chapterId === id,
);

export function useCardCountByCategoryRam(categoryId: string | undefined): number {
  return useSyncExternalStore(
    cardMapStore.subscribe,
    () => {
      if (!categoryId) return 0;
      const map = cardMapStore.getState().cardMap;
      let n = 0;
      for (const id in map) if (map[id].categoryId === categoryId) n++;
      return n;
    },
    () => 0,
  );
}

export function useCardByIdRam(id: string | undefined | null): Card | null {
  return useSyncExternalStore(
    cardMapStore.subscribe,
    () => {
      if (!id) return null;
      return cardMapStore.getState().cardMap[id] ?? null;
    },
    () => null,
  );
}

// ── PUBLIC API — un-suffixed names retained for view code. ────────────────
//
// These were façades during the dual-read window (PR-7d). Now they are
// thin re-exports so existing imports keep compiling without churn.

export function useCardsByCategory(categoryId: string | undefined): readonly Card[] {
  return useCardsByCategoryRam(categoryId);
}

export function useCardsBySubcategory(
  subcategoryId: string | undefined,
  _categoryId?: string,
): readonly Card[] {
  return useCardsBySubcategoryRam(subcategoryId);
}

export function useCardsByChapter(
  chapterId: string | undefined,
  _categoryId?: string,
): readonly Card[] {
  return useCardsByChapterRam(chapterId);
}

export function useCardCountByCategory(categoryId: string | undefined): number {
  return useCardCountByCategoryRam(categoryId);
}

export function useCardById(id: string | undefined | null): Card | null {
  return useCardByIdRam(id);
}
