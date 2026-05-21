// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Granular RAM selectors over `cardMapStore`.
//
// Each hook subscribes directly to the store and returns a STABLE array
// reference. A new array is only allocated when:
//   • the matched set's length changes, OR
//   • any matched card object identity changes
//
// View code that previously did `useCardData().cards.filter(...)` should
// migrate to these. Behavior is identical (same RAM source, same data) but
// re-render cost drops from "every card mutation anywhere" to "mutations
// inside the matched set only".
//
// Phase 2 will add Dexie-backed `*FromDb` variants behind a feature flag.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore, useRef } from "react";
import { cardMapStore } from "./useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";
import type { CardMap } from "@/lib/persist-queue";

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
        // re-render in pure-rerender scenarios (BroadcastChannel sync, etc).
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

// ── Named selectors ─────────────────────────────────────────────────────────

/** Cards whose `categoryId === id`. Stable array reference. */
export const useCardsByCategory = createCardSetSelector<string>(
  (c, id) => c.categoryId === id,
);

/** Cards whose `subcategoryId === id`. Stable array reference. */
export const useCardsBySubcategory = createCardSetSelector<string>(
  (c, id) => c.subcategoryId === id,
);

/** Cards whose `chapterId === id`. Stable array reference. */
export const useCardsByChapter = createCardSetSelector<string>(
  (c, id) => c.chapterId === id,
);

/**
 * Count of cards in a category. Returns a primitive (number), so
 * `useSyncExternalStore` short-circuits on `Object.is` equality —
 * components re-render only when the count actually changes.
 */
export function useCardCountByCategory(categoryId: string | undefined): number {
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
