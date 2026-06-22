/**
 * SQLite ready FSM — centralizovani lifecycle executor-a (O-1).
 *
 * Electron koristi isključivo main-process better-sqlite3 (Faza 5.4).
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";
import { canUseMainSqliteBackend } from "./backend";

export type SqliteReadyState =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "ready"; executor: SqlExecutor }
  | { type: "fatal"; error: unknown };

export type SqliteBootSummary = {
  backend: "main" | "e2e-memory";
  dbPath?: string;
};

let _lastBootSummary: SqliteBootSummary | null = null;

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

/** Last successful boot summary (Faza 5.2 telemetry). */
export function getLastSqliteBootSummary(): SqliteBootSummary | null {
  return _lastBootSummary;
}

export function subscribeSqliteReady(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

async function openMainProcessExecutor(): Promise<SqlExecutor> {
  const { initMainSqlite, getMainSqlExecutor } = await import(
    "./main-ipc-client"
  );
  const { runMigrations } = await import("./migration-runner");

  const open = await initMainSqlite();
  if (!open.ok) {
    throw new Error("Main-process SQLite open failed");
  }

  const executor = getMainSqlExecutor();
  await runMigrations(executor);
  const summary: SqliteBootSummary = {
    backend: "main",
    dbPath: open.dbPath,
  };
  _lastBootSummary = summary;
  logger.info("[sqlite] boot ready", summary);
  setState({ type: "ready", executor });
  return executor;
}

function fatalMainUnavailable(cause?: unknown): never {
  const err = new Error(
    "FatalError: Main-process SQLite unavailable. " +
      "This build requires Electron with sqliteRpc IPC.",
  );
  if (cause instanceof Error) {
    (err as Error & { cause?: unknown }).cause = cause;
  }
  setState({ type: "fatal", error: err });
  throw err;
}

async function openExecutor(): Promise<SqlExecutor> {
  const isE2E =
    import.meta.env.VITE_E2E === "1" ||
    import.meta.env.VITE_E2E === "true" ||
    import.meta.env.VITE_E2E === true;

  if (isE2E) {
    const { createE2eMemoryExecutor } = await import("@/e2e/browser-memory-sqlite");
    const executor = await createE2eMemoryExecutor();
    _lastBootSummary = { backend: "e2e-memory" };
    logger.info("[sqlite] boot ready", _lastBootSummary);
    setState({ type: "ready", executor });
    return executor;
  }

  if (!canUseMainSqliteBackend()) {
    fatalMainUnavailable();
  }

  try {
    return await openMainProcessExecutor();
  } catch (err) {
    logger.error("[sqlite] main-process open failed permanently", err);
    fatalMainUnavailable(err);
  }
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
  _lastBootSummary = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    __resetSqliteReadyForTests();
  });
}
