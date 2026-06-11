/**
 * SQLite ready FSM — centralizovani lifecycle executor-a (O-1).
 *
 * Modul-level signal sa subscribe API-jem (zero React deps). UI čita
 * preko `useSqliteReady()`; boot/queries/repos koriste `ensureSqliteReady()`
 * ili legacy `getOpfsSqliteExecutor()` delegaciju.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";

export type SqliteReadyState =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "ready"; executor: SqlExecutor }
  | { type: "degraded"; executor: SqlExecutor; reason: string }
  | { type: "fatal"; error: unknown };

let _state: SqliteReadyState = { type: "idle" };
const _listeners = new Set<() => void>();
let _initPromise: Promise<SqlExecutor> | null = null;

function sameState(a: SqliteReadyState, b: SqliteReadyState): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "degraded" && b.type === "degraded") {
    return a.reason === b.reason && a.executor === b.executor;
  }
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

function emitDegraded(
  reason: "opfs-api-missing" | "opfs-runtime-error",
  diag?: unknown
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("db-degraded", {
        detail: { reason, diag },
      })
    );
  } catch {
    /* noop */
  }
}

function isElectronRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    Boolean((window as { electronAPI?: unknown }).electronAPI)
  );
}

function rendererDiagSnapshot(): Record<string, unknown> {
  return {
    crossOriginIsolated:
      typeof self !== "undefined"
        ? (self as unknown as { crossOriginIsolated?: boolean })
            .crossOriginIsolated
        : undefined,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    hasNavigatorStorage:
      typeof navigator !== "undefined" &&
      !!(navigator as Navigator & {
        storage?: { getDirectory?: unknown };
      }).storage?.getDirectory,
    note: "Renderer snapshot; worker is the authoritative host",
  };
}

async function openExecutor(): Promise<SqlExecutor> {
  if (!isElectronRuntime() && !import.meta.env.PROD) {
    const { getDevFallbackExecutor } = await import("./dev-fallback");
    emitDegraded("opfs-runtime-error", {
      volatile: true,
      reason: "dev-fallback (no Electron, browser DEV)",
    });
    const executor = await getDevFallbackExecutor();
    setState({
      type: "degraded",
      executor,
      reason: "dev-fallback (no Electron, browser DEV)",
    });
    return executor;
  }

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
        `[sqlite] OPFS fallback, pokušaj... (${attempts} preostalo)`,
        result.initError
      );
      lastError = new Error(result.initError || "OPFS init failed");

      if (result.initError?.includes("missing")) {
        emitDegraded("opfs-api-missing", result.diag);
      }
    } catch (err) {
      logger.warn(
        `[sqlite] Worker krahirao pri boot-u (${attempts} preostalo)`,
        err
      );
      lastError = err;
    }

    attempts--;
    if (attempts > 0) {
      await new Promise<void>((res) =>
        taskScheduler.setTimeout(() => res(), 500, {
          label: "sqlite:boot-retry",
        })
      );
    }
  }

  logger.error(
    "[sqlite] Svi pokušaji pokretanja workera propali.",
    lastError
  );

  emitDegraded("opfs-runtime-error", {
    error:
      lastError instanceof Error ? lastError.message : String(lastError),
    rendererDiag: rendererDiagSnapshot(),
  });

  if (isElectronRuntime() && import.meta.env.PROD) {
    const err = new Error(
      "FatalError: Persistent SQLite OPFS failed to " +
        "initialize. App cannot continue without storage."
    );
    setState({ type: "fatal", error: err });
    throw err;
  }

  emitDegraded("opfs-runtime-error", {
    volatile: true,
    reason: "dev-fallback (post-OPFS-failure)",
  });
  const { getDevFallbackExecutor } = await import("./dev-fallback");
  const executor = await getDevFallbackExecutor();
  setState({
    type: "degraded",
    executor,
    reason: "dev-fallback (post-OPFS-failure)",
  });
  return executor;
}

export function ensureSqliteReady(): Promise<SqlExecutor> {
  const state = getSqliteReadyState();
  if (state.type === "ready" || state.type === "degraded") {
    return Promise.resolve(state.executor);
  }
  if (state.type === "fatal") {
    return Promise.reject(state.error);
  }
  if (_initPromise) return _initPromise;

  // #region agent log
  const _prewarmStart = Date.now();
  fetch('http://127.0.0.1:7244/ingest/bbcc467f-b810-4cc1-aebf-add63a6395ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f62800'},body:JSON.stringify({sessionId:'f62800',location:'readyMachine.ts:ensureSqliteReady',message:'SQLite init starting (opening executor)',data:{state:state.type},hypothesisId:'A',runId:'run1',timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  setState({ type: "opening" });
  _initPromise = openExecutor()
    .then((exec) => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/bbcc467f-b810-4cc1-aebf-add63a6395ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f62800'},body:JSON.stringify({sessionId:'f62800',location:'readyMachine.ts:ensureSqliteReady',message:'SQLite init DONE',data:{elapsedMs:Date.now()-_prewarmStart,finalState:getSqliteReadyState().type},hypothesisId:'A',runId:'run1',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      return exec;
    })
    .catch((err) => {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/bbcc467f-b810-4cc1-aebf-add63a6395ee',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f62800'},body:JSON.stringify({sessionId:'f62800',location:'readyMachine.ts:ensureSqliteReady',message:'SQLite init FAILED',data:{elapsedMs:Date.now()-_prewarmStart,error:String(err)},hypothesisId:'A',runId:'run1',timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
  if (state.type === "ready" || state.type === "degraded") {
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
