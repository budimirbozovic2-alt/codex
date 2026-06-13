/**
 * SQLite ready FSM — centralizovani lifecycle executor-a (O-1).
 *
 * Modul-level signal sa subscribe API-jem (zero React deps). Boot/queries/repos
 * koriste `ensureSqliteReady()` ili legacy `getOpfsSqliteExecutor()` delegaciju.
 * OPFS worker je obavezan — nema in-memory fallback-a.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";

export type SqliteReadyState =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "ready"; executor: SqlExecutor }
  | { type: "fatal"; error: unknown };

let _state: SqliteReadyState = { type: "idle" };
const _listeners = new Set<() => void>();
let _initPromise: Promise<SqlExecutor> | null = null;

function sameState(a: SqliteReadyState, b: SqliteReadyState): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "ready" && b.type === "ready") {
    return a.executor === b.executor;
  }
  if (a.type === "fatal" && b.type === "fatal") {
    return a.error === b.error;
  }
  return true;
}

function setState(next: SqliteReadyState): void {
  if (sameState(_state, next)) return;
  _state = next;
  for (const l of _listeners) {
    try {
      l();
    } catch (e) {
      logger.warn("[sqliteReady] listener threw", e);
    }
  }
}

export function getSqliteReadyState(): SqliteReadyState {
  return _state;
}

export function subscribeSqliteReady(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

async function openExecutor(): Promise<SqlExecutor> {
  let attempts = 3;
  let lastError: unknown = null;

  while (attempts > 0) {
    try {
      const { initWorkerExecutor, getWorkerSqlExecutor } = await import(
        "./worker-client"
      );

      const result = await initWorkerExecutor();

      if (result.opfsMode) {
        logger.info("[sqlite] opened OPFS-SAH-pool DB", result.diag);
        const executor = getWorkerSqlExecutor();
        setState({ type: "ready", executor });
        return executor;
      }

      logger.warn(
        `[sqlite] OPFS init failed, retry… (${attempts} preostalo)`,
        result.initError,
      );
      lastError = new Error(result.initError || "OPFS init failed");
    } catch (err) {
      logger.warn(
        `[sqlite] Worker krahirao pri boot-u (${attempts} preostalo)`,
        err,
      );
      lastError = err;
    }

    attempts--;
    if (attempts > 0) {
      await new Promise<void>((res) =>
        taskScheduler.setTimeout(() => res(), 500, {
          label: "sqlite:boot-retry",
        }),
      );
    }
  }

  const err = new Error(
    "FatalError: Persistent SQLite OPFS failed to " +
      "initialize. App cannot continue without storage.",
  );
  if (lastError instanceof Error) {
    (err as Error & { cause?: unknown }).cause = lastError;
  }

  logger.error("[sqlite] Svi pokušaji pokretanja workera propali.", lastError);
  setState({ type: "fatal", error: err });
  throw err;
}

export function ensureSqliteReady(): Promise<SqlExecutor> {
  const state = getSqliteReadyState();
  if (state.type === "ready") {
    return Promise.resolve(state.executor);
  }
  if (state.type === "fatal") {
    return Promise.reject(state.error);
  }
  if (_initPromise) return _initPromise;

  setState({ type: "opening" });
  _initPromise = openExecutor()
    .then((exec) => exec)
    .catch((err) => {
      _initPromise = null;
      if (getSqliteReadyState().type !== "fatal") {
        setState({ type: "fatal", error: err });
      }
      logger.error("[sqlite] open failed permanently", err);
      throw err;
    });

  return _initPromise;
}

export function getExecutorOrThrow(): SqlExecutor {
  const state = getSqliteReadyState();
  if (state.type === "ready") {
    return state.executor;
  }
  if (state.type === "fatal") {
    throw state.error;
  }
  throw new Error("SQLite not ready");
}

/** Test seam (vitest only). */
export function __resetSqliteReadyForTests(): void {
  _state = { type: "idle" };
  _listeners.clear();
  _initPromise = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    __resetSqliteReadyForTests();
  });
}
