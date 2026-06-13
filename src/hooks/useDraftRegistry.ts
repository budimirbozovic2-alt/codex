/**
 * `useHasAnyDirty` is a thin selector for the common nav-guard case where
 * the caller only cares whether *anything* is unsaved.
 *
 * `useIsDirty(key)` is the per-key selector — used by `useDirtyDialog` so
 * dialogs no longer have to thread an `isDirty` prop manually when the
 * editor inside already publishes to the registry via `useDraftAutosave`,
 * `useCardDraftAutosave`, or `usePersistedDraftMirror`.
 */
import { useEffect, useState } from "react";
import { draftRegistry } from "@/lib/drafts/draftRegistry";

export function useHasAnyDirty(): boolean {
  const [dirty, setDirty] = useState<boolean>(() => draftRegistry.hasAnyDirty());
  useEffect(() => draftRegistry.subscribe(snap => setDirty(snap.size > 0)), []);
  return dirty;
}

export function useIsDirty(key: string | null | undefined): boolean {
  const [dirty, setDirty] = useState<boolean>(() => (key ? draftRegistry.isDirty(key) : false));
  useEffect(() => {
    if (!key) { setDirty(false); return; }
    setDirty(draftRegistry.isDirty(key));
    return draftRegistry.subscribe(snap => setDirty(snap.has(key)));
  }, [key]);
  return dirty;
}
