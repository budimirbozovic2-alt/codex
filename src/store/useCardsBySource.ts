// ─────────────────────────────────────────────────────────────────────────────
// Phase 2a — TanStack-backed for view code; Zustand-backed for unit tests.
//
// `useCardsBySource` (public) reads via TanStack scoped query
// (`['cards','source',id]`) — event-invalidated by the `onCardsChanged`
// bridge. The Zustand implementation is retained as `useCardsBySourceRam`
// for the unit test that exercises the RAM-mirror semantics without
// requiring a QueryClientProvider.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore, useRef } from "react";
import { cardMapStore } from "./useCardMapStore";
import type { Card } from "@/lib/spaced-repetition";
import type { CardMap } from "@/lib/persist-queue";
import type { SourceIdLike } from "@/lib/ids";

export { useCardsBySource } from "@/hooks/card/useCardsQuery";

const EMPTY: readonly Card[] = Object.freeze([]);

interface SelectorCache {
  map: CardMap | null;
  sourceId: SourceIdLike | undefined;
  result: readonly Card[];
}

/** Legacy Zustand-backed variant — kept for unit tests of the RAM cache. */
export function useCardsBySourceRam(sourceId: SourceIdLike | undefined): readonly Card[] {
  const cache = useRef<SelectorCache>({ map: null, sourceId: undefined, result: EMPTY });

  return useSyncExternalStore(
    cardMapStore.subscribe,
    () => {
      if (!sourceId) return EMPTY;
      const map = cardMapStore.getState().cardMap;

      if (cache.current.map === map && cache.current.sourceId === sourceId) {
        return cache.current.result;
      }

      const matched: Card[] = [];
      for (const id in map) {
        const c = map[id];
        if (c.sourceId === sourceId) matched.push(c);
      }

      const prev = cache.current.result;
      const same =
        cache.current.sourceId === sourceId &&
        matched.length === prev.length &&
        matched.every((c, i) => c === prev[i]);

      const next = same ? prev : matched;
      cache.current = { map, sourceId, result: next };
      return next;
    },
    () => EMPTY,
  );
}
