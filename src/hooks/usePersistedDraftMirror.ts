/**
 * `usePersistedDraftMirror` — minimal companion to feature hooks that already
 * own their draft state but want crash-recovery persistence and visibility in
 * the global dirty registry (for nav-guards).
 *
 * Unlike `useDraftAutosave` it does NOT debounce a real save — it only mirrors
 * the latest `payload` into the SQLite `drafts` table and reports dirty status.
 * Use it from save-on-exit features (Zettelkasten article, source editor)
 * where the real persistence lives elsewhere.
 *
 * On `enabled=false` or on unmount the persisted row is cleared.
 */
import { useEffect, useRef } from "react";
import { taskScheduler } from "@/lib/scheduler";
import { draftRegistry } from "@/lib/drafts/draftRegistry";
import { putDraft, deleteDraft } from "@/lib/drafts/draftsTable";

export interface PersistedDraftMirrorOptions {
  /** Stable identifier (same value across renders for the same logical draft). */
  key: string;
  /** Producer tag for the `drafts` row. */
  source: string;
  /** Whether the draft is currently meaningful / should be tracked. */
  enabled: boolean;
  /** Latest snapshot — opaque JSON. */
  payload: unknown;
  /** Debounce between writes to SQLite (default 600 ms). */
  debounceMs?: number;
}

export function usePersistedDraftMirror(opts: PersistedDraftMirrorOptions): void {
  const { key, source, enabled, payload, debounceMs = 600 } = opts;
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  // Debounced SQLite drafts writer, owned by the scheduler.
  const flushRef = useRef<(() => void) & { cancel: () => void; flush: () => void } | null>(null);
  useEffect(() => {
    const fn = taskScheduler.debounce(
      () => {
        void putDraft({
          key,
          source,
          payload: payloadRef.current,
          updatedAt: Date.now(),
        });
      },
      debounceMs,
      { label: `draftMirror:${key}`, pauseWhenHidden: false },
    );
    flushRef.current = fn;
    return () => { fn.cancel(); };
  }, [key, source, debounceMs]);

  // Trigger debounced mirror on every payload change while enabled.
  useEffect(() => {
    if (!enabled) return;
    flushRef.current?.();
  }, [enabled, payload]);

  // Track dirty in the registry + clear persisted row when no longer dirty.
  useEffect(() => {
    if (enabled) {
      draftRegistry.markDirty(key);
    } else {
      draftRegistry.markClean(key);
      flushRef.current?.cancel();
      void deleteDraft(key);
    }
    return () => {
      draftRegistry.markClean(key);
    };
  }, [enabled, key]);

  // Force a final SQLite write on unmount so a crash in the next tick still has
  // the latest snapshot to recover from.
  useEffect(() => {
    return () => { flushRef.current?.flush(); };
  }, []);
}
