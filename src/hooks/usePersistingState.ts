import { useMutationState } from "@tanstack/react-query";

/**
 * Tracks in-flight card mutations via TanStack Query so App.tsx can show
 * the saving indicator and block the beforeunload unload guard while writes
 * are pending. All mutations registered through `useMutation` (save, remove,
 * bulkUpsert, gradeSection, bulkPatch) are counted automatically.
 */
export function usePersistingState() {
  const pendingCount = useMutationState({
    filters: { status: "pending" },
    select: () => 1,
  }).length;

  return { hasPending: pendingCount > 0, pendingCount };
}
