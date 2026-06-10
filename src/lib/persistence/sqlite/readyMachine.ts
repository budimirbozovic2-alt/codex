/**
 * O-1: Centralizovani SQLite Boot FSM.
 *
 * Vlasništvuje životni ciklus SqlExecutor-a. Konzumenti čitaju
 * stanje preko subscribeSqliteReady() (non-React) ili useSqliteReady()
 * (React hook). client.ts je tanki delegate na ensureSqliteReady().
 *
 *   idle → opening → ready
 *                  → degraded (volatile dev-fallback)
 *                  → fatal
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";

export type SqliteDegradedReason =
  | "dev-fallback-no-electron"
  | "dev-fallback-post-failure";

export type SqliteReadyState =
  | { type: "idle" }
  | { type: "opening" }
  | { type: "ready"; executor: SqlExecutor }
  | { type: "degraded"; executor: SqlExecutor; reason: SqliteDegradedReason }
  | { type: "fatal"; error: Error };

let _state: SqliteReadyState = { type: "idle" };
let _promise: Promise<SqlExecutor> | null = null;
const _listeners = new Set<() => void>();

export function getSqliteReadyState(): SqliteReadyState {
  return _state;
}

export function subscribeSqliteReady(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

function setState(next: SqliteReadyState): void {
  _state = next;
  for (const l of _listeners) {
    try { l(); } catch (e) { logger.warn("[sqliteReady] listener threw", e); }
  }
}

function emitDegraded(
  reason: "opfs-api-missing" | "opfs-runtime-error",
  diag?: unknown,
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("db-degraded", { detail: { reason, diag } }),
    );
  } catch { /* noop */ }
}

function isElectronRuntime(): boolean {
  return typeof window !== "undefined" &&
    Boolean((window as { electronAPI?: unknown }).electronAPI);
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

/**
 * Sinhroni accessor — throws ako FSM nije u ready/degraded stanju.
 * Namijenjen hot-path-ovima koji su garantovano poslije ready-a.
 */
export function getExecutorOrThrow(): SqlExecutor {
  if (_state.type === "ready" || _state.type === "degraded") {
    return _state.executor;
  }
  throw new Error(
    `[sqliteReady] executor not ready (state=${_state.type}); ` +
    `await ensureSqliteReady() first`,
  );
}

/**
 * Idempotentni async gate. Prvi poziv vrti retry-loop; svi
 * sljedeći vraćaju isti promise / cached executor.
 */
export function ensureSqliteReady(): Promise<SqlExecutor> {
  if (_promise) return _promise;
  if (_state.type === "ready" || _state.type === "degraded") {
    return Promise.resolve(_state.executor);
  }

  setState({ type: "opening" });

  _promise = (async (): Promise<SqlExecutor> => {
    // ─── Branch A: browser DEV (no Electron) ────────────
    if (!isElectronRuntime() && !import.meta.env.PROD) {
      const { getDevFallbackExecutor } = await import("./dev-fallback");
      const executor = await getDevFallbackExecutor();
      emitDegraded("opfs-runtime-error", {
        volatile: true,
        reason: "dev-fallback (no Electron, browser DEV)",
      });
      setState({
        type: "degraded",
        executor,
        reason: "dev-fallback-no-electron",
      });
      return executor;
    }

    // ─── Branch B: Electron / PROD — pokušaj OPFS ────────
    let attempts = 3;
    let lastError: unknown = null;

    while (attempts > 0) {
      try {
        const { initWorkerExecutor, getWorkerSqlExecutor } =
          await import("./worker-client");
        const result = await initWorkerExecutor();

        if (result.opfsMode) {
          logger.info("[sqlite] opened OPFS-SAH-pool DB", result.diag);
          const executor = getWorkerSqlExecutor();
          setState({ type: "ready", executor });
          return executor;
        }

        logger.warn(
          `[sqlite] OPFS fallback, pokušaj... (${attempts} preostalo)`,
          result.initError,
        );
        lastError = new Error(result.initError || "OPFS init failed");

        if (result.initError?.includes("missing")) {
          emitDegraded("opfs-api-missing", result.diag);
        }
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
          })
        );
      }
    }

    logger.error(
      "[sqlite] Svi pokušaji pokretanja workera propali.",
      lastError,
    );

    emitDegraded("opfs-runtime-error", {
      error: lastError instanceof Error
        ? lastError.message
        : String(lastError),
      rendererDiag: rendererDiagSnapshot(),
    });

    // ─── PROD Electron: hard fail (B-3 / O-7) ────────────
    if (isElectronRuntime() && import.meta.env.PROD) {
      const fatal = new Error(
        "FatalError: Persistent SQLite OPFS failed to " +
        "initialize. App cannot continue without storage.",
      );
      setState({ type: "fatal", error: fatal });
      throw fatal;
    }

    // ─── Branch C: non-PROD Electron / browser PROD — degrade ─
    emitDegraded("opfs-runtime-error", {
      volatile: true,
      reason: "dev-fallback (post-OPFS-failure)",
    });
    const { getDevFallbackExecutor } = await import("./dev-fallback");
    const executor = await getDevFallbackExecutor();
    setState({
      type: "degraded",
      executor,
      reason: "dev-fallback-post-failure",
    });
    return executor;
  })().catch((err) => {
    _promise = null;
    if (_state.type !== "fatal") {
      const error = err instanceof Error ? err : new Error(String(err));
      setState({ type: "fatal", error });
    }
    logger.error("[sqlite] open failed permanently", err);
    throw err;
  });

  return _promise;
}

/** Test seam (vitest only). */
export function __resetSqliteReadyMachine(): void {
  _state = { type: "idle" };
  _promise = null;
  _listeners.clear();
}
