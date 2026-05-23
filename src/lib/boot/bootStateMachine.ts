/**
 * PR4 — Boot state machine.
 *
 * Jedinstveni signal stanja boot-a aplikacije:
 *
 *   idle → opening → migrating → loading → ready
 *             ↓          ↓           ↓
 *          blocked    version    corrupted
 *
 * Modul-level signal sa subscribe API-jem (zero React deps), preko kojeg
 * `BootStateProvider` reaguje preko `useSyncExternalStore`. Pre-React
 * pozivaoci (`ensureDbOpen`, `bootDb`) ga čitaju/pišu direktno.
 *
 * Postojeća `dbErrorState` semantika je očuvana — `transition()` mapira
 * legacy `setDbErrorState` pozive u nova stanja (vidi `mapDbErrorToState`).
 */
import { logger } from "@/lib/logger";

export type BootPhase =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "migrating"; from: number; to: number }
  | { type: "loading"; pct: number; label: string }
  | { type: "ready" }
  | { type: "blocked"; tabCount: number; reason: "tabs" | "timeout" }
  | { type: "version"; message: string }
  | { type: "corrupted"; message: string };

export type BootEvent =
  | { type: "OPEN_START" }
  | { type: "OPEN_OK" }
  | { type: "OPEN_BLOCKED"; tabCount?: number }
  | { type: "OPEN_TIMEOUT" }
  | { type: "VERSION_MISMATCH"; message: string }
  | { type: "CORRUPTED"; message: string }
  | { type: "MIGRATE_START"; from: number; to: number }
  | { type: "MIGRATE_DONE" }
  | { type: "LOAD_PROGRESS"; pct: number; label: string }
  | { type: "READY" }
  | { type: "RESET" };

let _state: BootPhase = { type: "idle" };
const _listeners = new Set<() => void>();

export function getBootState(): BootPhase {
  return _state;
}

export function subscribeBootState(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function setState(next: BootPhase) {
  if (sameState(_state, next)) return;
  _state = next;
  for (const l of _listeners) {
    try { l(); } catch (e) { logger.warn("[bootState] listener threw", e); }
  }
}

function sameState(a: BootPhase, b: BootPhase): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case "migrating": {
      const bb = b as Extract<BootPhase, { type: "migrating" }>;
      return a.from === bb.from && a.to === bb.to;
    }
    case "loading": {
      const bb = b as Extract<BootPhase, { type: "loading" }>;
      return a.pct === bb.pct && a.label === bb.label;
    }
    case "blocked": {
      const bb = b as Extract<BootPhase, { type: "blocked" }>;
      return a.tabCount === bb.tabCount && a.reason === bb.reason;
    }
    case "version": {
      const bb = b as Extract<BootPhase, { type: "version" }>;
      return a.message === bb.message;
    }
    case "corrupted": {
      const bb = b as Extract<BootPhase, { type: "corrupted" }>;
      return a.message === bb.message;
    }
    default:
      return true;
  }
}

/**
 * Apply a transition. Invalid transitions su log-ovane ali ne throw-aju —
 * boot mora biti tolerantan na neočekivane redoslijede iz async path-a.
 */
export function transition(event: BootEvent): void {
  const prev = _state;
  const next = reduce(prev, event);
  if (next === prev) {
    if (event.type !== "LOAD_PROGRESS") {
      // LOAD_PROGRESS ignoriše dok nije u loading fazi — to je očekivano,
      // ostali no-op-i možda nisu.
      logger.debug(`[bootState] noop: ${prev.type} ← ${event.type}`);
    }
    return;
  }
  setState(next);
}

function reduce(state: BootPhase, e: BootEvent): BootPhase {
  if (e.type === "RESET") return { type: "idle" };

  // Terminalna error stanja samo `RESET` izlazi.
  if (state.type === "version" || state.type === "corrupted" || state.type === "blocked") {
    if (e.type === "OPEN_OK") return { type: "ready" }; // recovery succeeded
    return state;
  }

  switch (e.type) {
    case "OPEN_START":
      return { type: "opening" };
    case "OPEN_OK":
      // Move forward only if we are mid-boot; READY emit will land later.
      return state.type === "opening" ? state : state;
    case "OPEN_BLOCKED":
      return { type: "blocked", tabCount: e.tabCount ?? 1, reason: "tabs" };
    case "OPEN_TIMEOUT":
      return { type: "blocked", tabCount: 1, reason: "timeout" };
    case "VERSION_MISMATCH":
      return { type: "version", message: e.message };
    case "CORRUPTED":
      return { type: "corrupted", message: e.message };
    case "MIGRATE_START":
      return { type: "migrating", from: e.from, to: e.to };
    case "MIGRATE_DONE":
      return { type: "loading", pct: 0, label: "Učitavanje…" };
    case "LOAD_PROGRESS":
      return { type: "loading", pct: e.pct, label: e.label };
    case "READY":
      return { type: "ready" };
    default:
      return state;
  }
}

// ─── Test helpers ───────────────────────────────────────
export function __resetBootStateForTests(): void {
  _state = { type: "idle" };
  _listeners.clear();
}
