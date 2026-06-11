/**
 * DB error / event facade.
 *
 * Provides the IoC seam used by `main.tsx` to inject `eventBus` into the
 * persistence layer (so DB infra events flow through without circular
 * dependency on `event-bus`), plus the shared `DbErrorState` consumed by
 * `useDbError` / `RecoveryGate`.
 */
import { EVENT_TYPES, type EventType } from "./event-bus-types";

// ─── IoC emitter (injected from main.tsx) ──────────────────────────────
type DbEmitter = (type: EventType, payload?: unknown) => void;
type TabCounter = () => number;

let _emit: DbEmitter = () => { /* no-op (SSR / test without bus) */ };
let _getTabCount: TabCounter = () => 1;

export function setDbEventEmitter(emit: DbEmitter, getTabCount?: TabCounter): void {
  _emit = emit;
  if (getTabCount) _getTabCount = getTabCount;
}

/** Internal accessor used by infra-layer callers to forward DB events. */
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

