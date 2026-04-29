/**
 * Renderer-side bridge for "before quit" / "tab is going away" signals.
 *
 * Resolution order (first available wins, no double-binding):
 *   1. `window.electronAPI.onBeforeQuit`        — preferred future-proof channel
 *   2. `window.electronAPI.onQuitBackupRequested` — current Electron channel
 *      (the bridge calls `notifyQuitBackupDone()` after the handler resolves
 *      so the main process can release its quit lock).
 *   3. `document.visibilitychange` (state === "hidden") — web/dev fallback.
 *
 * The bridge is a module-level singleton so multiple consumers (useCards,
 * main.tsx backup snapshot, …) can register without each duplicating the
 * platform-detection plumbing. It guarantees serial execution: while one
 * handler batch is awaiting, late-arriving signals coalesce into a single
 * rerun once the in-flight flush settles.
 */

type QuitHandler = () => void | Promise<void>;

interface ElectronQuitAPI {
  onBeforeQuit?: (cb: () => void | Promise<void>) => () => void;
  onQuitBackupRequested?: (cb: () => void | Promise<void>) => () => void;
  notifyQuitBackupDone?: () => void;
}

const handlers = new Set<QuitHandler>();
let initialised = false;
let teardown: (() => void) | null = null;

let inFlight: Promise<void> | null = null;
let queued = false;

async function runHandlers(): Promise<void> {
  if (inFlight) {
    queued = true;
    return inFlight;
  }
  inFlight = (async () => {
    try {
      // Snapshot to avoid mutation-during-iteration if a handler unregisters.
      const snapshot = Array.from(handlers);
      await Promise.allSettled(snapshot.map((h) => Promise.resolve().then(h)));
    } finally {
      inFlight = null;
      if (queued) {
        queued = false;
        // Tail call — fire-and-forget, callers already have their promise.
        void runHandlers();
      }
    }
  })();
  return inFlight;
}

function getElectronAPI(): ElectronQuitAPI | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { electronAPI?: ElectronQuitAPI }).electronAPI;
}

function init(): void {
  if (initialised) return;
  initialised = true;

  const api = getElectronAPI();

  // 1) Preferred: explicit before-quit channel
  if (api?.onBeforeQuit) {
    teardown = api.onBeforeQuit(async () => {
      await runHandlers();
    });
    return;
  }

  // 2) Current Electron contract — bridge owns the lock release
  if (api?.onQuitBackupRequested) {
    teardown = api.onQuitBackupRequested(async () => {
      try {
        await runHandlers();
      } finally {
        try { api.notifyQuitBackupDone?.(); } catch { /* lock will time out */ }
      }
    });
    return;
  }

  // 3) Browser fallback — visibilitychange is more reliable than beforeunload
  if (typeof document !== "undefined") {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Fire-and-forget: tab may die before the promise resolves, but
        // handlers should at least *start* synchronously (e.g. a queued
        // IDB transaction will still complete after the page unloads).
        void runHandlers();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    teardown = () => document.removeEventListener("visibilitychange", onVisibility);
  }
}

/**
 * Register a handler invoked once per quit signal.
 * Returns an unsubscribe function. Safe to call before / after `init()`.
 */
export function onBeforeQuit(handler: QuitHandler): () => void {
  init();
  handlers.add(handler);
  return () => { handlers.delete(handler); };
}

/**
 * Manually trigger every registered handler (useful for tests and for
 * imperative shutdown paths such as in-app "Restart" buttons).
 */
export function triggerBeforeQuit(): Promise<void> {
  return runHandlers();
}

/** Test/HMR helper — unbinds the platform listener and clears handlers. */
export function _resetBeforeQuitBridge(): void {
  try { teardown?.(); } catch { /* noop */ }
  teardown = null;
  initialised = false;
  handlers.clear();
  inFlight = null;
  queued = false;
}
