import { toast } from "sonner";
import { Card } from "@/lib/spaced-repetition";
import { idbBulkApply } from "@/lib/db";
import { db } from "@/lib/db-schema";

import { logger } from "@/lib/logger";
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

// ─── Outbox WAL writer ───────────────────────────────────
// Each enqueue fires (and forgets) an outbox upsert keyed by cardId. Last
// write wins. Flush deletes the matching rows atomically with the card
// mutation, so a row still present on next boot represents a write that
// did not complete and must be re-applied by `recoverOutboxOnBoot()`.
//
// Errors here are swallowed: outbox is best-effort crash insurance, not a
// blocker for the optimistic in-memory commit that has already happened.
function outboxPut(card: Card): void {
  void db.outbox.put({ cardId: card.id, op: "put", card, ts: Date.now() })
    .catch((err) => logger.warn("[persistQueue] outbox put failed", err));
}
function outboxDelete(id: string): void {
  void db.outbox.put({ cardId: id, op: "delete", ts: Date.now() })
    .catch((err) => logger.warn("[persistQueue] outbox delete-op failed", err));
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
  // Phase A / P0-2: replaces the 100ms polling in `usePersistingState`.
  // Notification is fire-and-forget; subscribers must read `hasPending()` /
  // `getPendingCount()` themselves (push the event, pull the state).
  const listeners = new Set<() => void>();
  let notifyScheduled = false;
  function notify() {
    if (notifyScheduled) return;
    notifyScheduled = true;
    // Coalesce bursts (e.g. bulk enqueue then immediate flush) into one tick.
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
      outboxPut(action.card);
    } else if (action.type === "delete") {
      const id = action.id;
      if (import.meta.env.DEV && pendingPuts.has(id)) {
        logger.warn("[persistQueue] delete cancelling pending put for id", id);
      }
      pendingPuts.delete(id);
      pendingDeletes.set(id, { seq: ++globalSeq });
      outboxDelete(id);
    } else {
      for (const c of action.cards) {
        if (import.meta.env.DEV && pendingDeletes.has(c.id)) {
          logger.warn("[persistQueue] bulk put after pending delete for id", c.id);
        }
        pendingDeletes.delete(c.id);
        pendingPuts.set(c.id, { card: c, seq: ++globalSeq });
        outboxPut(c);
      }
    }
    notify();
  }

  function hasPending() {
    return pendingPuts.size > 0 || pendingDeletes.size > 0;
  }

  let _retryAttempt = 0;
  const MAX_RETRY = 3;

  // Snapshot of writes currently inside the flush transaction. If the user
  // closes the tab while inflight, `cleanup()` awaits a stable "no inflight"
  // moment so beforeunload doesn't return before IDB commits.
  let inFlightCount = 0;

  async function flush() {
    timer = null;
    if (!hasPending()) return;

    // Snapshot + clear before async work so concurrent enqueues queue up
    // for the next flush instead of getting silently dropped.
    const snapPuts = Array.from(pendingPuts.entries());
    const snapDels = Array.from(pendingDeletes.entries());
    pendingPuts.clear();
    pendingDeletes.clear();
    notify();

    inFlightCount++;
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    try {
      // Atomic unit: card mutation + outbox clear share one rw transaction.
      // A crash after this commit leaves no outbox row → no re-apply on boot.
      // A crash before this commit leaves the outbox row → recover on boot.
      await db.transaction("rw", db.cards, db.outbox, async () => {
        await idbBulkApply(
          snapPuts.map(([, e]) => e.card),
          snapDels.map(([id]) => id),
        );
        const clearIds = [
          ...snapPuts.map(([id]) => id),
          ...snapDels.map(([id]) => id),
        ];
        if (clearIds.length > 0) await db.outbox.bulkDelete(clearIds);
      });
      _retryAttempt = 0;
      if (import.meta.env.DEV) {
        const dur = (performance.now() - t0).toFixed(1);
        logger.debug(`[persistQueue] flush ok puts=${snapPuts.length} deletes=${snapDels.length} ${dur}ms`);
      }
    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err));

      // Re-enqueue snapshot, but ONLY where the in-flight write has not
      // already been superseded by a newer enqueue (seq comparison). This
      // closes the lost-update window that the original implementation
      // had: stale snapshots can no longer overwrite a newer pending write.
      for (const [id, entry] of snapPuts) {
        const cur = pendingPuts.get(id);
        const curDel = pendingDeletes.get(id);
        if (curDel) continue;          // a newer delete is queued, drop stale put
        if (!cur || cur.seq < entry.seq) {
          pendingPuts.set(id, entry);
        }
      }
      for (const [id, entry] of snapDels) {
        const cur = pendingDeletes.get(id);
        const curPut = pendingPuts.get(id);
        if (curPut) continue;          // a newer put cancels the stale delete
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
    // If a flush is in-flight (e.g. visibility hidden triggered earlier),
    // wait for it to settle so beforeunload doesn't return before IDB commits.
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
 * Boot-time outbox recovery. Replaces `checkInterruptedFlush()`'s
 * "previous session had interrupted writes" warning with a real recovery:
 * any outbox row left behind by a crash is re-applied to the cards table
 * atomically. Idempotent — last-write-wins per cardId guarantees we never
 * resurrect older state.
 */
export async function recoverOutboxOnBoot(): Promise<{ recovered: number }> {
  let rows;
  try {
    rows = await db.outbox.toArray();
  } catch (err) {
    logger.warn("[persistQueue] outbox scan failed", err);
    return { recovered: 0 };
  }
  if (rows.length === 0) return { recovered: 0 };

  const puts: Card[] = [];
  const deletes: string[] = [];
  for (const row of rows) {
    if (row.op === "put" && row.card) puts.push(row.card);
    else if (row.op === "delete") deletes.push(row.cardId);
  }

  try {
    await db.transaction("rw", db.cards, db.outbox, async () => {
      await idbBulkApply(puts, deletes);
      await db.outbox.bulkDelete(rows.map(r => r.cardId));
    });
    logger.info(`[persistQueue] recovered ${rows.length} pending writes from outbox`);
    return { recovered: rows.length };
  } catch (err) {
    logger.error("[persistQueue] outbox recovery failed", err);
    toast.error("Oporavak nedovršenih izmjena nije uspio. Izvezite backup prije nastavka.");
    return { recovered: 0 };
  }
}

/**
 * @deprecated Use `recoverOutboxOnBoot()` — the sessionStorage flag was
 * replaced by the durable `outbox` table in v20. Stub kept so legacy callers
 * compile; it forwards to the recovery path and discards the result.
 */
export function checkInterruptedFlush(): void {
  void recoverOutboxOnBoot();
}
