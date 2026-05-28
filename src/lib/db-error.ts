/**
 * Dexie-free DB error / watchdog facade.
 *
 * Extracted from `db-schema.ts` in A1c Phase 2 so that the React side
 * (DbErrorProvider, boot, tests) can import error-state utilities without
 * pulling Dexie into the bundle. The Dexie shell (`MemoriaDB` + `ensureDbOpen`)
 * imports back from here for state mutations.
 */
import { EVENT_TYPES, type EventType } from "./event-bus-types";
import { logger } from "./logger";

// ─── IoC emitter (injected from main.tsx) ──────────────────────────────
type DbEmitter = (type: EventType, payload?: unknown) => void;
type TabCounter = () => number;

let _emit: DbEmitter = () => { /* no-op (SSR / test without bus) */ };
let _getTabCount: TabCounter = () => 1;

export function setDbEventEmitter(emit: DbEmitter, getTabCount?: TabCounter): void {
  _emit = emit;
  if (getTabCount) _getTabCount = getTabCount;
}

/** Internal accessor used by the Dexie shell to forward blocked/versionchange events. */
export function emitDbEvent(type: EventType, payload?: unknown): void {
  try { _emit(type, payload); } catch { /* swallow */ }
}

export function getTabCount(): number { return _getTabCount(); }

// ─── Global error state ────────────────────────────────────────────────
export type DbErrorState = { type: "version" | "timeout"; message: string } | null;

let _dbErrorState: DbErrorState = null;

export function getDbErrorState(): DbErrorState { return _dbErrorState; }
export function setDbErrorState(next: DbErrorState): void {
  _dbErrorState = next;
  try { _emit(EVENT_TYPES.DB_ERROR_CHANGED, next); } catch { /* noop */ }
}

// ─── Blocked-rejecter registry (used by ensureDbOpen race) ─────────────
const _blockedRejecters = new Set<(err: Error) => void>();
export function registerBlockedRejecter(fn: (err: Error) => void): void {
  _blockedRejecters.add(fn);
}
export function unregisterBlockedRejecter(fn: (err: Error) => void): void {
  _blockedRejecters.delete(fn);
}
export function rejectAllBlocked(err: Error): void {
  for (const r of _blockedRejecters) {
    try { r(err); } catch { /* noop */ }
  }
  _blockedRejecters.clear();
}

// ─── Unblock watchdog ──────────────────────────────────────────────────
let _reloadScheduled = false;
let _unblockIntervalId: ReturnType<typeof setInterval> | null = null;

export function __teardownDbWatchdog(): void {
  if (_unblockIntervalId !== null) {
    clearInterval(_unblockIntervalId);
    _unblockIntervalId = null;
  }
  _reloadScheduled = false;
}

export function startUnblockWatch(): void {
  if (_unblockIntervalId) return;
  _unblockIntervalId = setInterval(() => {
    if (!_dbErrorState) {
      clearInterval(_unblockIntervalId!);
      _unblockIntervalId = null;
      return;
    }
    if (_dbErrorState.type === "timeout" && _getTabCount() <= 1) {
      if (import.meta.env.DEV) logger.log("[MemoriaDB] Only one tab remains, clearing blocked state...");
      setDbErrorState(null);
      emitDbEvent(EVENT_TYPES.DB_UNBLOCKED);
      clearInterval(_unblockIntervalId!);
      _unblockIntervalId = null;
      if (!_reloadScheduled) {
        _reloadScheduled = true;
        setTimeout(() => window.location.reload(), 1000);
      }
    }
  }, 2000);
}

/** Schedule a forced reload if the timeout state lingers past the grace window. */
export function scheduleTimeoutReload(graceMs: number): void {
  setTimeout(() => {
    if (_dbErrorState?.type === "timeout" && !_reloadScheduled) {
      _reloadScheduled = true;
      logger.log("[MemoriaDB] Blocked timeout, reloading...");
      window.location.reload();
    }
  }, graceMs);
}

// Debounced blocked emitter (Dexie can fire `blocked` repeatedly).
let _lastBlockedEmitAt = 0;
export function emitBlockedThrottled(): void {
  const now = Date.now();
  if (now - _lastBlockedEmitAt < 250) return;
  _lastBlockedEmitAt = now;
  emitDbEvent(EVENT_TYPES.DB_BLOCKED);
}
