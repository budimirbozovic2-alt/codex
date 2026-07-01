/**
 * Hook boundary for the source-content save store. Source-reader UI imports
 * these instead of reaching into `@/store/useSourceContentSaveStore` directly
 * (architecture guard). Reactive status uses a selector; actions are the
 * store's stable references; non-reactive helpers are re-exported as-is.
 */
import {
  useSourceContentSaveStore,
  getSourceContentDirty,
  flushSourceContentSave,
  registerSourceContentFlush,
  type SourceContentSaveStatus,
} from "@/store/useSourceContentSaveStore";

export {
  getSourceContentDirty,
  flushSourceContentSave,
  registerSourceContentFlush,
};
export type { SourceContentSaveStatus };

/** Reactive save status (subscribes to store updates). */
export function useSourceSaveStatus(): SourceContentSaveStatus {
  return useSourceContentSaveStore((s) => s.status);
}

/** Stable store actions for updating save state. */
export function useSourceSaveActions() {
  const setStatus = useSourceContentSaveStore((s) => s.setStatus);
  const setDirty = useSourceContentSaveStore((s) => s.setDirty);
  const reset = useSourceContentSaveStore((s) => s.reset);
  return { setStatus, setDirty, reset };
}
