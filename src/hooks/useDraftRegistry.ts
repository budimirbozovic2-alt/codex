/**
 * `useDraftRegistry` — React subscription to the global `draftRegistry`.
 * Returns the live snapshot of dirty keys. Re-renders only when the set
 * actually changes (the registry already coalesces redundant transitions).
 *
 * `useHasAnyDirty` is a thin selector for the common nav-guard case where
 * the caller only cares whether *anything* is unsaved.
 */
import { useEffect, useState } from "react";
import { draftRegistry } from "@/lib/drafts/draftRegistry";

export function useDraftRegistry(): ReadonlySet<string> {
  const [snapshot, setSnapshot] = useState<ReadonlySet<string>>(() => draftRegistry.snapshot());
  useEffect(() => draftRegistry.subscribe(setSnapshot), []);
  return snapshot;
}

export function useHasAnyDirty(): boolean {
  const [dirty, setDirty] = useState<boolean>(() => draftRegistry.hasAnyDirty());
  useEffect(() => draftRegistry.subscribe(snap => setDirty(snap.size > 0)), []);
  return dirty;
}
