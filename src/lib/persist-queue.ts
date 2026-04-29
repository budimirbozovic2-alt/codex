import { toast } from "sonner";
import { Card } from "@/lib/spaced-repetition";
import {
  idbDeleteCard,
  idbBulkPutCards,
} from "@/lib/db";

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
  const pending: PersistAction[] = [];
  let timer: number | null = null;

  async function flush() {
    timer = null;
    const actions = pending.splice(0);
    if (actions.length === 0) {
      try { sessionStorage.removeItem("codex-flush-pending"); } catch {}
      return;
    }
    try { sessionStorage.setItem("codex-flush-pending", "1"); } catch {}

    try {
      const puts: Card[] = [];
      const deletes: string[] = [];
      for (const a of actions) {
        if (a.type === "put") puts.push(a.card);
        else if (a.type === "delete") deletes.push(a.id);
        else if (a.type === "bulk") puts.push(...a.cards);
      }

      if (puts.length > 0) await idbBulkPutCards(puts);
      if (deletes.length > 0) {
        const results = await Promise.allSettled(deletes.map(id => idbDeleteCard(id)));
        results.forEach((r, i) => {
          if (r.status === "rejected") console.error(`[persistQueue] delete failed for ${deletes[i]}`, r.reason);
        });
      }
      try { sessionStorage.removeItem("codex-flush-pending"); } catch {}
    } catch (err: unknown) {
      try { sessionStorage.removeItem("codex-flush-pending"); } catch {}
      const e = err instanceof Error ? err : new Error(String(err));
      if (e.message === "QUOTA_EXCEEDED") {
        toast.error("Memorija browsera je puna! Exportuj backup i očisti nepotrebne podatke.");
      } else {
        console.error("[persistQueue] flush failed", err);
      }
    }
  }

  function schedule(action: PersistAction) {
    pending.push(action);
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
    if (pending.length > 0) {
      try { sessionStorage.setItem("codex-flush-pending", "1"); } catch {}
      await flush();
    }
  }

  return { schedule, cleanup, flush, hasPending: () => pending.length > 0 };
}

// Singleton persist queue — created once per module, safe for StrictMode double-mount
export const persistQueue = createPersistQueue();
export const schedulePersist = persistQueue.schedule;

// ─── Eager flush on tab hide (most reliable cross-browser signal) ────
// C4 fix: Use a named handler so HMR re-evaluation removes the old one first
function _onVisibilityChange() {
  if (document.visibilityState === "hidden" && persistQueue.hasPending()) {
    try { sessionStorage.setItem("codex-flush-pending", "1"); } catch {}
    persistQueue.flush();
  }
}
if (typeof document !== "undefined") {
  document.removeEventListener("visibilitychange", _onVisibilityChange);
  document.addEventListener("visibilitychange", _onVisibilityChange);
}

/** Check if previous session had interrupted writes */
export function checkInterruptedFlush(): void {
  try {
    if (sessionStorage.getItem("codex-flush-pending") === "1") {
      console.warn("[boot] Previous session had interrupted writes — data may be stale");
      sessionStorage.removeItem("codex-flush-pending");
    }
  } catch {}
}
