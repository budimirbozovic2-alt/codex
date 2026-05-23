/**
 * `useDraftAutosave` — unified replacement for the three ad-hoc draft hooks
 * (`useCardDraftAutosave`, `useArticleDraft`, `useSourceEditing`'s timer).
 *
 * Responsibilities:
 *   • Debounced save via `taskScheduler.setTimeout` (single shutdown surface).
 *   • Latest-ref pattern so cleanup-flush never sees a stale closure.
 *   • Three exit triggers: `visibilitychange → hidden`, unmount, `beforeunload`.
 *   • Optional persisted recovery snapshot in the Dexie `drafts` table.
 *   • Centralized dirty registration so a single nav-guard can ask "is anything
 *     dirty?" without enumerating call sites.
 *
 * `isDirty` is DERIVED — `!equals(draft, source)` — never a manual flag. That
 * eliminates the "forgot to setDirty(false) after save" bug class that plagued
 * each of the three original hooks.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { taskScheduler } from "@/lib/scheduler";
import { logger } from "@/lib/logger";
import { draftRegistry } from "@/lib/drafts/draftRegistry";
import { putDraft, deleteDraft } from "@/lib/drafts/draftsTable";

export interface DraftAutosaveOptions<T> {
  /** Stable identifier — used for dirty registry, persist row, and debounce label. */
  key: string;
  /** Producer tag for the `drafts` table when `persistDraft` is on. */
  source: string;
  /** Current source-of-truth value (e.g. saved card from IDB). */
  initial: T;
  /** Persist function. Must be idempotent — may be called multiple times. */
  save: (draft: T) => Promise<void>;
  /** Equality function — default `Object.is`. Pass a deep-equal for object drafts. */
  equals?: (a: T, b: T) => boolean;
  /** Debounce delay before autosave (default 800 ms). */
  debounceMs?: number;
  /** Save on tab hide / unmount / beforeunload (default true). */
  saveOnExit?: boolean;
  /** When true, mirror every change into the IDB `drafts` table for crash recovery. */
  persistDraft?: boolean;
  /** Disable everything (e.g. while form is closed). Default true. */
  enabled?: boolean;
}

export interface DraftAutosaveReturn<T> {
  draft: T;
  setDraft: (next: T | ((prev: T) => T)) => void;
  isDirty: boolean;
  isSaving: boolean;
  /** Force immediate save bypassing the debounce. Resolves after save settles. */
  saveNow: () => Promise<void>;
  /** Revert draft to the current `initial` and drop the persisted snapshot. */
  discard: () => void;
  /** Replace `initial`-baseline (call after the caller persists externally). */
  reset: (next: T) => void;
}

export function useDraftAutosave<T>(opts: DraftAutosaveOptions<T>): DraftAutosaveReturn<T> {
  const {
    key,
    source,
    initial,
    save,
    equals = Object.is,
    debounceMs = 800,
    saveOnExit = true,
    persistDraft = false,
    enabled = true,
  } = opts;

  const [draft, _setDraft] = useState<T>(initial);
  const [isSaving, setIsSaving] = useState(false);

  // Latest-ref pattern: every async pathway reads the current snapshot from
  // here, never from a captured closure. Updated synchronously on every
  // setDraft so debounced flush sees what the user actually typed last.
  const draftRef = useRef<T>(initial);
  const sourceRef = useRef<T>(initial);
  const equalsRef = useRef(equals);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);

  // Keep refs current without re-creating callbacks.
  equalsRef.current = equals;
  saveRef.current = save;
  enabledRef.current = enabled;
  sourceRef.current = initial;

  const isDirty = !equals(draft, initial);

  // Mirror dirty state into the global registry.
  useEffect(() => {
    if (!enabled) return;
    if (isDirty) draftRegistry.markDirty(key);
    else draftRegistry.markClean(key);
    return () => { draftRegistry.markClean(key); };
  }, [enabled, isDirty, key]);

  const setDraft = useCallback((next: T | ((prev: T) => T)) => {
    _setDraft(prev => {
      const resolved = typeof next === "function"
        ? (next as (prev: T) => T)(prev)
        : next;
      draftRef.current = resolved;
      // Fire-and-forget persisted snapshot (best-effort; errors logged inside).
      if (persistDraft && enabledRef.current && !equalsRef.current(resolved, sourceRef.current)) {
        void putDraft({ key, source, payload: resolved, updatedAt: Date.now() });
      }
      return resolved;
    });
  }, [key, source, persistDraft]);

  // ─── Save pipeline ─────────────────────────────────────────────
  const flushImmediate = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    const snapshot = draftRef.current;
    if (equalsRef.current(snapshot, sourceRef.current)) return;
    setIsSaving(true);
    try {
      await saveRef.current(snapshot);
      // Caller is expected to push the new value back via `initial` prop;
      // we proactively clear the persisted draft regardless.
      if (persistDraft) await deleteDraft(key);
    } catch (err) {
      logger.warn(`[useDraftAutosave:${key}] save failed`, err);
    } finally {
      setIsSaving(false);
    }
  }, [key, persistDraft]);

  // Debounced wrapper, owned by scheduler so it dies cleanly on shutdown.
  const debouncedSave = useMemo(
    () => taskScheduler.debounce(
      () => { void flushImmediate(); },
      debounceMs,
      { label: `draft:${key}`, pauseWhenHidden: false },
    ),
    [flushImmediate, debounceMs, key],
  );

  // Trigger debounce on draft change.
  useEffect(() => {
    if (!enabled || !isDirty) return;
    debouncedSave();
  }, [draft, enabled, isDirty, debouncedSave]);

  // Exit triggers: visibility hidden, beforeunload, unmount.
  useEffect(() => {
    if (!enabled || !saveOnExit) return;
    const onHide = () => { if (document.visibilityState === "hidden") { debouncedSave.flush(); } };
    const onBeforeUnload = () => { debouncedSave.flush(); };
    window.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      // Flush on unmount so route changes never lose typing.
      debouncedSave.flush();
    };
  }, [enabled, saveOnExit, debouncedSave]);

  const saveNow = useCallback(async () => {
    debouncedSave.cancel();
    await flushImmediate();
  }, [debouncedSave, flushImmediate]);

  const discard = useCallback(() => {
    debouncedSave.cancel();
    _setDraft(sourceRef.current);
    draftRef.current = sourceRef.current;
    draftRegistry.markClean(key);
    if (persistDraft) void deleteDraft(key);
  }, [debouncedSave, key, persistDraft]);

  const reset = useCallback((next: T) => {
    debouncedSave.cancel();
    _setDraft(next);
    draftRef.current = next;
    sourceRef.current = next;
    draftRegistry.markClean(key);
    if (persistDraft) void deleteDraft(key);
  }, [debouncedSave, key, persistDraft]);

  return { draft, setDraft, isDirty, isSaving, saveNow, discard, reset };
}
