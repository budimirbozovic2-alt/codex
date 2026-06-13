/**
 * useLinkedCards — thin wrapper around the indexed `cardsBySource` query.
 *
 * Extracted from `SourceEditor.tsx` (R1) so UI components stop importing
 * `db` directly. The fetcher is imperative (called inside the save handler)
 * rather than reactive, which matches the original call-site semantics and
 * keeps the dialog free of reactive re-renders.
 *
 * PR-9 A1c-3: cardsBySource routes through SQLite `queries/cards.ts`.
 */
import { useCallback } from "react";
import { cardsBySource } from "@/lib/db/queries";
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
