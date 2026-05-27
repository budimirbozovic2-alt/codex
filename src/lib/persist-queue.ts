import { toast } from "sonner";
import { Card } from "@/lib/spaced-repetition";
import { logger } from "@/lib/logger";
import { idbOutboxAdapter } from "@/lib/persistence/idb-outbox-adapter";
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

// ─── Adapter wiring (PR-7d M3.2 / Pure Desktop finale) ──
// All IDB-specific writes go through the adapter. Pure Desktop default:
// pick SQLite-primary when the one-shot migration flag is present in
// localStorage (mirrored from SQLite kv on previous boot). On first boot
// after deploy, falls back to IDB-primary + SQLite mirror until the boot
// migration completes; next boot promotes SQLite.
function pickInitialAdapter(): PersistAdapter {
  if (typeof window === "undefined") return idbOutboxAdapter;
  const isElectron = Boolean((window as { electronAPI?: unknown }).electronAPI);
  // Lazy require avoids pulling sqlite-wasm into the dev bundle at this scope.
  const { getDefaultAdapter } = require("@/lib/persistence/adapter-factory") as
    typeof import("@/lib/persistence/adapter-factory");
  const { hasMigrationFlagSync } = require("@/lib/persistence/sqlite/migrate-from-idb") as
    typeof import("@/lib/persistence/sqlite/migrate-from-idb");
  return getDefaultAdapter({
    isElectron,
    migrationComplete: hasMigrationFlagSync(),
    enableSqlitePrimary: true,
  });
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
    const adapter = getAdapter();
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
      void adapter.enqueueWal({ kind: "put", card: action.card });
    } else if (action.type === "delete") {
      const id = action.id;
      if (import.meta.env.DEV && pendingPuts.has(id)) {
        logger.warn("[persistQueue] delete cancelling pending put for id", id);
      }
      pendingPuts.delete(id);
      pendingDeletes.set(id, { seq: ++globalSeq });
      void adapter.enqueueWal({ kind: "delete", id });
    } else {
      for (const c of action.cards) {
        if (import.meta.env.DEV && pendingDeletes.has(c.id)) {
          logger.warn("[persistQueue] bulk put after pending delete for id", c.id);
        }
        pendingDeletes.delete(c.id);
        pendingPuts.set(c.id, { card: c, seq: ++globalSeq });
        void adapter.enqueueWal({ kind: "put", card: c });
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
      if (import.meta.env.DEV) {
        const dur = (performance.now() - t0).toFixed(1);
        logger.debug(`[persistQueue] flush ok puts=${snapPuts.length} deletes=${snapDels.length} ${dur}ms`);
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));

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
      if (_retryAttempt < MAX_RETRY) {
        const delay = 200 * Math.pow(2, _retryAttempt);
        _retryAttempt++;
        if (timer === null) {
          timer = window.setTimeout(flush, delay);
        }
      } else {
        _retryAttempt = 0;
        toast.error("Pisanje u bazu nije uspjelo nakon više pokušaja. HITNO eksportujte backup!");
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

  async function cleanup(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (hasPending()) {
      await flush();
    }
    while (inFlightCount > 0) {
      await new Promise<void>(r => queueMicrotask(r));
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

/**
 * Boot-time outbox recovery — delegates to the persist adapter.
 */
export async function recoverOutboxOnBoot(): Promise<{ recovered: number }> {
  return getAdapter().recoverPending();
}

/**
 * @deprecated Use `recoverOutboxOnBoot()` — the sessionStorage flag was
 * replaced by the durable `outbox` table in v20. Stub kept so legacy callers
 * compile; it forwards to the recovery path and discards the result.
 */
export function checkInterruptedFlush(): void {
  void recoverOutboxOnBoot();
}
