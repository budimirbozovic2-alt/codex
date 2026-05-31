import { toast } from "sonner";
import { Card } from "@/lib/spaced-repetition";
import { logger } from "@/lib/logger";
import { getDefaultAdapter } from "@/lib/persistence/adapter-factory";
import type { PersistAdapter } from "@/lib/persistence/PersistAdapter";

// ─── Internal Map type for O(1) access ──────────────────
export type CardMap = Record<string, Card>;

export function arrayToMap(cards: Card[]): CardMap {
  const map: CardMap = {};
  for (const c of cards) map[c.id] = c;
  return map;
}

// ─── Surgical persist helpers ───────────────────────────
export type PersistAction =
  | { type: "put"; card: Card }
  | { type: "delete"; id: string }
  | { type: "bulk"; cards: Card[] };

// ─── Adapter wiring (Pure Desktop, SQLite-only) ─────────
// All persistence goes through SQLite/OPFS via the adapter factory. The
// IDB mirror and migration-flag dance were dropped in A1c-4 once the
// one-shot IDB→SQLite migration was retired.
function pickInitialAdapter(): PersistAdapter {
  const isElectron =
    typeof window !== "undefined" &&
    Boolean((window as { electronAPI?: unknown }).electronAPI);
  return getDefaultAdapter({ isElectron });
}
let _adapter: PersistAdapter = pickInitialAdapter();
/** Test seam — swap the persistence backend (e.g. in-memory adapter in vitest). */
export function __setPersistAdapter(adapter: PersistAdapter): void {
  _adapter = adapter;
}
function getAdapter(): PersistAdapter {
  return _adapter;
}


function createPersistQueue() {
  // Coalesce by id: last write wins; delete after put cancels put; put after delete cancels delete.
  // Each entry carries a monotone sequence number used by the retry path to
  // decide whether a re-enqueued snapshot has been superseded by a newer write.
  interface PutEntry { card: Card; seq: number; }
  interface DelEntry { seq: number; }
  const pendingPuts = new Map<string, PutEntry>();
  const pendingDeletes = new Map<string, DelEntry>();
  let timer: number | null = null;
  let globalSeq = 0;

  // ─── Observable: subscribers notified on every queue state change ──
  const listeners = new Set<() => void>();
  let notifyScheduled = false;
  function notify() {
    if (notifyScheduled) return;
    notifyScheduled = true;
    queueMicrotask(() => {
      notifyScheduled = false;
      for (const l of listeners) {
        try { l(); } catch (e) { logger.warn("[persistQueue] listener threw", e); }
      }
    });
  }
  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  function enqueue(action: PersistAction) {
    if (action.type === "put") {
      const id = action.card.id;
      if (import.meta.env.DEV && pendingDeletes.has(id)) {
        logger.warn("[persistQueue] put after pending delete for id", id);
      }
      if (import.meta.env.DEV) {
        const prev = pendingPuts.get(id);
        const prevTs = prev?.card.updatedAt ?? 0;
        const nextTs = action.card.updatedAt ?? 0;
        if (prev && nextTs < prevTs) {
          logger.warn(
            "[persistQueue] enqueue replacing newer put with older for id",
            id, { prevTs, nextTs },
          );
        }
      }
      pendingDeletes.delete(id);
      pendingPuts.set(id, { card: action.card, seq: ++globalSeq });
    } else if (action.type === "delete") {
      const id = action.id;
      if (import.meta.env.DEV && pendingPuts.has(id)) {
        logger.warn("[persistQueue] delete cancelling pending put for id", id);
      }
      pendingPuts.delete(id);
      pendingDeletes.set(id, { seq: ++globalSeq });
    } else {
      for (const c of action.cards) {
        if (import.meta.env.DEV && pendingDeletes.has(c.id)) {
          logger.warn("[persistQueue] bulk put after pending delete for id", c.id);
        }
        pendingDeletes.delete(c.id);
        pendingPuts.set(c.id, { card: c, seq: ++globalSeq });
      }
    }
    notify();
  }


  function hasPending() {
    return pendingPuts.size > 0 || pendingDeletes.size > 0;
  }

  let _retryAttempt = 0;
  const MAX_RETRY = 3;

  let inFlightCount = 0;
  // Last flush error — surfaced to interactive callers via `cleanup({ strict })`
  // so TanStack mutations can roll back instead of falsely succeeding.
  let _lastFlushError: Error | null = null;

  async function flush() {
    timer = null;
    if (!hasPending()) return;

    const snapPuts = Array.from(pendingPuts.entries());
    const snapDels = Array.from(pendingDeletes.entries());
    pendingPuts.clear();
    pendingDeletes.clear();
    notify();

    inFlightCount++;
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    try {
      await getAdapter().bulkApply(
        snapPuts.map(([, e]) => e.card),
        snapDels.map(([id]) => id),
      );
      _retryAttempt = 0;
      _lastFlushError = null;
      if (import.meta.env.DEV) {
        const dur = (performance.now() - t0).toFixed(1);
        logger.debug(`[persistQueue] flush ok puts=${snapPuts.length} deletes=${snapDels.length} ${dur}ms`);
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));
      _lastFlushError = e;

      // Re-enqueue stale snapshot only where not superseded by a newer write.
      for (const [id, entry] of snapPuts) {
        const cur = pendingPuts.get(id);
        const curDel = pendingDeletes.get(id);
        if (curDel) continue;
        if (!cur || cur.seq < entry.seq) {
          pendingPuts.set(id, entry);
        }
      }
      for (const [id, entry] of snapDels) {
        const cur = pendingDeletes.get(id);
        const curPut = pendingPuts.get(id);
        if (curPut) continue;
        if (!cur || cur.seq < entry.seq) {
          pendingDeletes.set(id, entry);
        }
      }
      notify();

      if (e.message === "QUOTA_EXCEEDED") {
        toast.error("Memorija browsera je puna! Exportuj backup i očisti nepotrebne podatke.");
        return;
      }

      logger.error(`[persistQueue] flush failed (attempt ${_retryAttempt + 1}/${MAX_RETRY})`, err);

      // NO_EXECUTOR is a structural failure (wasm load broken / dev shell) —
      // retrying it just burns time and produces a multi-second latency
      // for every card mutation. Surface it immediately instead.
      const isNoExecutor = e.message === "NO_EXECUTOR";

      if (!isNoExecutor && _retryAttempt < MAX_RETRY) {
        const delay = 200 * Math.pow(2, _retryAttempt);
        _retryAttempt++;
        if (timer === null) {
          timer = window.setTimeout(flush, delay);
        }
      } else {
        _retryAttempt = 0;
        if (!isNoExecutor) {
          toast.error("Pisanje u bazu nije uspjelo nakon više pokušaja. HITNO eksportujte backup!");
        }
      }
    } finally {
      inFlightCount--;
    }
  }

  function schedule(action: PersistAction) {
    enqueue(action);
    if (timer !== null) return;
    timer = window.setTimeout(flush, 16);
  }

  interface CleanupOpts { strict?: boolean }

  async function cleanup(opts: CleanupOpts = {}): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // Reset error tracking before a strict drain so we only see errors
    // produced by THIS flush, not leftovers from a previous background flush.
    if (opts.strict) _lastFlushError = null;
    if (hasPending()) {
      await flush();
    }
    while (inFlightCount > 0) {
      await new Promise<void>(r => queueMicrotask(r));
    }
    if (opts.strict && _lastFlushError) {
      const err = _lastFlushError;
      _lastFlushError = null;
      throw err;
    }
  }

  return {
    schedule,
    cleanup,
    flush,
    hasPending,
    getPendingCount: () => pendingPuts.size + pendingDeletes.size,
    subscribe,
  };
}

// Singleton persist queue — created once per module, safe for StrictMode double-mount
export const persistQueue = createPersistQueue();
export const schedulePersist = persistQueue.schedule;

// ─── Eager flush on tab hide (most reliable cross-browser signal) ────
declare global {
  // eslint-disable-next-line no-var
  var __codexPersistVisHandler: (() => void) | undefined;
}

function _onVisibilityChange() {
  if (document.visibilityState === "hidden" && persistQueue.hasPending()) {
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      if (globalThis.__codexPersistVisHandler) {
        document.removeEventListener("visibilitychange", globalThis.__codexPersistVisHandler);
        globalThis.__codexPersistVisHandler = undefined;
      }
      if (persistQueue.hasPending()) persistQueue.flush();
    } catch (e) { logger.warn("[persistQueue] HMR dispose failed", e); }
  });
}

// Outbox crash-recovery (`recoverOutboxOnBoot` / `checkInterruptedFlush`)
// was removed in A1a — SQLite WAL is the durability primitive now and the
// Dexie `outbox` table is dropped in v23. Boot no longer runs a recovery step.

