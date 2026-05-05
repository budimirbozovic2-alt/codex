import { toast } from "sonner";
import { Card } from "@/lib/spaced-repetition";
import { idbBulkApply } from "@/lib/db";

// ─── Internal Map type for O(1) access ──────────────────
export type CardMap = Record<string, Card>;

export function arrayToMap(cards: Card[]): CardMap {
  const map: CardMap = {};
  for (const c of cards) map[c.id] = c;
  return map;
}

// Version-based cache — avoids O(n) reconstruction when map hasn't changed (B4 fix)
let _mapVersion = 0;
let _cachedVersion = -1;
let _cachedArray: Card[] = [];

/** Call after every setCardMapState mutation to signal that the map changed */
export function bumpMapVersion() { _mapVersion++; }

export function mapToArray(map: CardMap): Card[] {
  if (_mapVersion === _cachedVersion) return _cachedArray;
  _cachedVersion = _mapVersion;
  _cachedArray = Object.values(map);
  return _cachedArray;
}

// ─── Surgical persist helpers ───────────────────────────
export type PersistAction =
  | { type: "put"; card: Card }
  | { type: "delete"; id: string }
  | { type: "bulk"; cards: Card[] };

function createPersistQueue() {
  // Coalesce by id: last write wins; delete after put cancels put; put after delete cancels delete.
  const pendingPuts = new Map<string, Card>();
  const pendingDeletes = new Set<string>();
  let timer: number | null = null;

  function enqueue(action: PersistAction) {
    if (action.type === "put") {
      pendingDeletes.delete(action.card.id);
      pendingPuts.set(action.card.id, action.card);
    } else if (action.type === "delete") {
      pendingPuts.delete(action.id);
      pendingDeletes.add(action.id);
    } else {
      // bulk
      for (const c of action.cards) {
        pendingDeletes.delete(c.id);
        pendingPuts.set(c.id, c);
      }
    }
  }

  function hasPending() {
    return pendingPuts.size > 0 || pendingDeletes.size > 0;
  }

  // V1: Re-enqueue + bounded exponential backoff retry. On failure we MUST
  // restore the in-flight batch into the pending maps (without clobbering any
  // newer writes that arrived during the in-flight window — newer wins).
  let _retryAttempt = 0;
  const MAX_RETRY = 3;

  async function flush() {
    timer = null;
    if (!hasPending()) {
      try { sessionStorage.removeItem("codex-flush-pending"); } catch { /* noop */ }
      return;
    }
    const puts = Array.from(pendingPuts.values());
    const deletes = Array.from(pendingDeletes);
    pendingPuts.clear();
    pendingDeletes.clear();

    try { sessionStorage.setItem("codex-flush-pending", "1"); } catch { /* noop */ }
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    try {
      await idbBulkApply(puts, deletes);
      _retryAttempt = 0;
      try { sessionStorage.removeItem("codex-flush-pending"); } catch { /* noop */ }
      if (import.meta.env.DEV) {
        const dur = (performance.now() - t0).toFixed(1);
        console.debug(`[persistQueue] flush ok puts=${puts.length} deletes=${deletes.length} ${dur}ms`);
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      // Re-enqueue: NEWER writes (already in pending maps) must win over the
      // failed in-flight batch. Only re-add ids that have NOT been touched
      // since we drained.
      for (const c of puts) {
        if (!pendingPuts.has(c.id) && !pendingDeletes.has(c.id)) {
          pendingPuts.set(c.id, c);
        }
      }
      for (const id of deletes) {
        if (!pendingPuts.has(id) && !pendingDeletes.has(id)) {
          pendingDeletes.add(id);
        }
      }

      if (e.message === "QUOTA_EXCEEDED") {
        // Quota errors will not improve with retry — surface and stop.
        try { sessionStorage.removeItem("codex-flush-pending"); } catch { /* noop */ }
        toast.error("Memorija browsera je puna! Exportuj backup i očisti nepotrebne podatke.");
        return;
      }

      console.error(`[persistQueue] flush failed (attempt ${_retryAttempt + 1}/${MAX_RETRY})`, err);
      if (_retryAttempt < MAX_RETRY) {
        const delay = 200 * Math.pow(2, _retryAttempt);
        _retryAttempt++;
        if (timer === null) {
          timer = window.setTimeout(flush, delay);
        }
      } else {
        _retryAttempt = 0;
        try { sessionStorage.removeItem("codex-flush-pending"); } catch { /* noop */ }
        toast.error("Pisanje u bazu nije uspjelo nakon više pokušaja. HITNO eksportujte backup!");
      }
    }
  }

  function schedule(action: PersistAction) {
    enqueue(action);
    if (timer !== null) return;
    timer = window.setTimeout(flush, 16);
  }

  /**
   * Async cleanup — cancels pending timer and **awaits** flush so callers can
   * guarantee all queued writes hit IndexedDB before returning. Use this in
   * Electron beforeQuit / quit-backup paths and other shutdown handlers.
   */
  async function cleanup(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (hasPending()) {
      try { sessionStorage.setItem("codex-flush-pending", "1"); } catch { /* noop */ }
      await flush();
    }
  }

  return { schedule, cleanup, flush, hasPending };
}

// Singleton persist queue — created once per module, safe for StrictMode double-mount
export const persistQueue = createPersistQueue();
export const schedulePersist = persistQueue.schedule;

// ─── Eager flush on tab hide (most reliable cross-browser signal) ────
// M4 fix: HMR re-evaluates this module with a fresh `_onVisibilityChange`
// closure each time. We pin the active handler to a `globalThis` slot so we
// can reliably remove the *previous* version (whose function reference is
// now lost from this module's scope) before registering the new one.
declare global {
  // eslint-disable-next-line no-var
  var __codexPersistVisHandler: (() => void) | undefined;
}

function _onVisibilityChange() {
  if (document.visibilityState === "hidden" && persistQueue.hasPending()) {
    try { sessionStorage.setItem("codex-flush-pending", "1"); } catch { /* noop */ }
    persistQueue.flush();
  }
}

if (typeof document !== "undefined") {
  if (globalThis.__codexPersistVisHandler) {
    document.removeEventListener("visibilitychange", globalThis.__codexPersistVisHandler);
  }
  globalThis.__codexPersistVisHandler = _onVisibilityChange;
  document.addEventListener("visibilitychange", _onVisibilityChange);
}

// HMR cleanup — flush pending writes and detach this module's handler before
// the next evaluation registers its replacement.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      if (globalThis.__codexPersistVisHandler) {
        document.removeEventListener("visibilitychange", globalThis.__codexPersistVisHandler);
        globalThis.__codexPersistVisHandler = undefined;
      }
      if (persistQueue.hasPending()) persistQueue.flush();
    } catch (e) { console.warn("[persistQueue] HMR dispose failed", e); }
  });
}

/** Check if previous session had interrupted writes */
export function checkInterruptedFlush(): void {
  try {
    if (sessionStorage.getItem("codex-flush-pending") === "1") {
      console.warn("[boot] Previous session had interrupted writes — data may be stale");
      sessionStorage.removeItem("codex-flush-pending");
    }
  } catch { /* noop */ }
}
