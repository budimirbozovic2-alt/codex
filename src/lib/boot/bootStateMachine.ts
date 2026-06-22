/**
 * Boot state machine — eksplicitne faze sa per-faza error tipovima i
 * recovery akcijama.
 *
 *   idle → opening → schema → loading → ready
 *             ↓        ↓                  ↓
 *          blocked   schema-error     load-error
 *          version
 *          corrupted
 *
 * Modul-level signal sa subscribe API-jem (zero React deps), preko kojeg
 * `BootStateProvider` reaguje preko `useSyncExternalStore`. Pre-React
 * pozivaoci (`ensureDbOpen`, `bootDb`, `runSchema`) ga
 * čitaju/pišu direktno preko `transition()`.
 *
 * Data heal + editor-v4 migration run during SQLite schema migrations (v11–v15),
 * not as a runtime `healing` boot phase.
 *
 * Backward kompat: stari `MIGRATE_*` eventi su alias-ovani u nova
 * `SCHEMA_*` stanja kako bi se izbjegli sinhroni rewrite svih pozivalaca.
 */
import { logger } from "@/lib/logger";

type SchemaErrorCause = "version" | "blocked" | "timeout" | "unknown";

export type BootPhase =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "schema"; pct: number; label: string }
  | { type: "loading"; pct: number; label: string }
  | { type: "ready" }
  | { type: "blocked"; tabCount: number; reason: "tabs" | "timeout" }
  | { type: "version"; message: string }
  | { type: "schema-error"; cause: SchemaErrorCause; message: string }
  | { type: "load-error"; message: string }
  | { type: "corrupted"; message: string };

export type BootEvent =
  | { type: "OPEN_START" }
  | { type: "OPEN_OK" }
  | { type: "OPEN_BLOCKED"; tabCount?: number }
  | { type: "OPEN_TIMEOUT" }
  | { type: "VERSION_MISMATCH"; message: string }
  | { type: "CORRUPTED"; message: string }
  | { type: "SCHEMA_START" }
  | { type: "SCHEMA_PROGRESS"; pct: number; label: string }
  | { type: "SCHEMA_DONE" }
  | { type: "SCHEMA_FAIL"; cause: SchemaErrorCause; message: string }
  | { type: "LOAD_PROGRESS"; pct: number; label: string }
  | { type: "LOAD_FAIL"; message: string }
  | { type: "READY" }
  | { type: "RECOVERY_REQUESTED" }
  | { type: "RESET" }
  // ─── Deprecated aliases (mapirani u reduce-u) ─────────
  | { type: "MIGRATE_START"; from: number; to: number }
  | { type: "MIGRATE_DONE" };

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
    case "schema": {
      const bb = b as Extract<BootPhase, { type: "schema" }>;
      return a.pct === bb.pct && a.label === bb.label;
    }
    case "loading": {
      const bb = b as Extract<BootPhase, { type: "loading" }>;
      return a.pct === bb.pct && a.label === bb.label;
    }
    case "blocked": {
      const bb = b as Extract<BootPhase, { type: "blocked" }>;
      return a.tabCount === bb.tabCount && a.reason === bb.reason;
    }
    case "version":
    case "load-error":
    case "corrupted": {
      const bb = b as Extract<BootPhase, { type: "version" | "load-error" | "corrupted" }>;
      return a.message === bb.message;
    }
    case "schema-error": {
      const bb = b as Extract<BootPhase, { type: "schema-error" }>;
      return a.message === bb.message && a.cause === bb.cause;
    }
    default:
      return true;
  }
}

/**
 * Apply a transition. Invalid transitions su log-ovane ali ne throw-uju —
 * boot mora biti tolerantan na neočekivane redoslijede iz async path-a.
 */
export function transition(event: BootEvent): void {
  const prev = _state;
  const next = reduce(prev, event);
  if (next === prev) {
    if (event.type !== "LOAD_PROGRESS" && event.type !== "SCHEMA_PROGRESS") {
      logger.debug(`[bootState] noop: ${prev.type} ← ${event.type}`);
    }
    return;
  }
  setState(next);
}

function reduce(state: BootPhase, e: BootEvent): BootPhase {
  if (e.type === "RESET") return { type: "idle" };

  // Recovery iz terminalnih error stanja
  if (e.type === "RECOVERY_REQUESTED") {
    if (state.type === "schema-error") return { type: "opening" };
    if (state.type === "load-error") return { type: "loading", pct: 0, label: "Ponovni pokušaj…" };
    return state;
  }

  // Terminalna error stanja: jedini izlaz je RESET / RECOVERY_REQUESTED /
  // OPEN_OK (legacy recovery path).
  if (
    state.type === "version" ||
    state.type === "corrupted" ||
    state.type === "blocked" ||
    state.type === "schema-error" ||
    state.type === "load-error"
  ) {
    if (e.type === "OPEN_OK") return { type: "ready" };
    return state;
  }

  switch (e.type) {
    case "OPEN_START":
      return { type: "opening" };
    case "OPEN_OK":
      // Boot orchestrator emituje SCHEMA_START odmah poslije; ostani.
      return state;
    case "OPEN_BLOCKED":
      return { type: "blocked", tabCount: e.tabCount ?? 1, reason: "tabs" };
    case "OPEN_TIMEOUT":
      return { type: "blocked", tabCount: 1, reason: "timeout" };
    case "VERSION_MISMATCH":
      return { type: "version", message: e.message };
    case "CORRUPTED":
      return { type: "corrupted", message: e.message };

    case "SCHEMA_START":
    case "MIGRATE_START": // alias
      return { type: "schema", pct: 0, label: "Schema upgrade…" };
    case "SCHEMA_PROGRESS":
      return state.type === "schema" ? { type: "schema", pct: e.pct, label: e.label } : state;
    case "SCHEMA_DONE":
    case "MIGRATE_DONE": // alias
      return { type: "loading", pct: 0, label: "Učitavanje…" };
    case "SCHEMA_FAIL":
      return { type: "schema-error", cause: e.cause, message: e.message };

    case "LOAD_PROGRESS":
      return state.type === "loading" ? { type: "loading", pct: e.pct, label: e.label } : state;
    case "LOAD_FAIL":
      return { type: "load-error", message: e.message };
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

// Audit v2 / Wave B.6: HMR dispose. Without this, Vite re-evaluates this
// module independently of `splashBridge`, leaving the two modules
// out-of-sync — either `_state`/`_listeners` reset while the bridge
// still believes it is installed, or old listener closures point at the
// stale module's `markBootStep`. Resetting on dispose keeps both modules
// in lockstep for the rest of the HMR session (dev-only).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    __resetBootStateForTests();
  });
}
