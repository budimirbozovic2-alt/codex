/**
 * B1 Cards cut-over — TanStack Query consumers for the cards atom.
 *
 * `useAllCards()` reads from the unified `['cards', 'all']` query. Data is
 * pushed into the cache by the one-way mirror in `useCardMapStore.ts` after
 * every Zustand commit; the `queryFn` here is only invoked on bootstrap if
 * no seed exists, or when the bridge invalidation triggers a background
 * refetch.
 *
 * Granular selectors (`useCardsByCategory`, etc.) still live in
 * `@/store/useCardSelectors.ts` and read Zustand directly via
 * `useSyncExternalStore` — those keep working unchanged and tests don't
 * need a QueryClientProvider. This hook is the entry point for new
 * consumers that prefer TanStack semantics (suspense, isFetching, etc.).
 */
import { useQuery } from "@tanstack/react-query";
import { listAllCards } from "@/lib/db/queries";
import { queryKeys } from "@/lib/query/keys";
import type { Card } from "@/lib/spaced-repetition";

const EMPTY: readonly Card[] = Object.freeze([]);

export function useAllCards(): readonly Card[] {
  const { data } = useQuery({
    queryKey: queryKeys.cards.all(),
    queryFn: listAllCards,
    staleTime: Infinity,
  });
  return data ?? EMPTY;
}
