// ─────────────────────────────────────────────────────────────────────────────
// Granular selector — subscribe to cards whose `sourceId === id`.
//
// Replaces the "God context" pattern where callers pulled the entire 15k
// `cards` array from CardStateContext just to filter by sourceId. This
// selector subscribes directly to `cardMapStore` and returns a stable array
// reference: a new array is only allocated when the matched set actually
// changes (length OR any matched card object identity).
//
// Lives next to `useCardMapStore.ts` because it is a pure store selector —
// no React context, no Provider, safe to call from any hook.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore, useRef } from "react";
import { cardMapStore } from "./useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";
import type { CardMap } from "@/lib/persist-queue";
import type { SourceIdLike } from "@/lib/ids";

const EMPTY: readonly Card[] = Object.freeze([]);

interface SelectorCache {
  map: CardMap | null;
  sourceId: SourceIdLike | undefined;
  result: readonly Card[];
}

/**
 * Subscribe to cards whose `sourceId === id`. Returns a stable array
 * reference: a new array is only produced when the set of matching
 * cards changes. Pass `undefined`/empty string to opt out.
 */
export function useCardsBySource(sourceId: SourceIdLike | undefined): readonly Card[] {
  const cache = useRef<SelectorCache>({ map: null, sourceId: undefined, result: EMPTY });

  return useSyncExternalStore(
    cardMapStore.subscribe,
    () => {
      if (!sourceId) return EMPTY;
      const map = cardMapStore.getState().cardMap;

      // Same map root + same sourceId → reuse cached array reference.
      if (cache.current.map === map && cache.current.sourceId === sourceId) {
        return cache.current.result;
      }

      const matched: Card[] = [];
      for (const id in map) {
        const c = map[id];
        if (c.sourceId === sourceId) matched.push(c);
      }

      // Shallow-equal vs last result — if every matched card object reference
      // is unchanged, return the prior array to suppress re-render.
      const prev = cache.current.result;
      const same =
        cache.current.sourceId === sourceId &&
        matched.length === prev.length &&
        matched.every((c, i) => c === prev[i]);

      const next = same ? prev : matched;
      cache.current = { map, sourceId, result: next };
      return next;
    },
    () => EMPTY, // SSR snapshot
  );
}
