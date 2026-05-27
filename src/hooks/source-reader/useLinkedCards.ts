/**
 * useLinkedCards — thin wrapper around the indexed `cardsBySource` query.
 *
 * Extracted from `SourceEditor.tsx` (R1) so UI components stop importing
 * `db` directly. The fetcher is imperative (called inside the save handler)
 * rather than reactive, which matches the original call-site semantics and
 * keeps the dialog free of `useLiveQuery` re-renders.
 *
 * When the read-path moves to TanStack Query (PR-9), this hook becomes the
 * single seam to swap in a `useQuery` without touching `SourceEditor`.
 */
import { useCallback } from "react";
import { cardsBySource } from "@/lib/db/queries/cards";
import type { Card } from "@/lib/spaced-repetition";

export interface UseLinkedCardsApi {
  /** Fetch all cards linked to the given source by `sourceId`. */
  fetchLinkedCards: (sourceId: string) => Promise<Card[]>;
}

export function useLinkedCards(): UseLinkedCardsApi {
  const fetchLinkedCards = useCallback(
    (sourceId: string) => cardsBySource(sourceId),
    [],
  );
  return { fetchLinkedCards };
}
