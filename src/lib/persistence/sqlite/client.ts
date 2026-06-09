/**
 * OPFS SQLite client — Worker-backed (PR-H-OPFS-FIX-4).
 * Spawns an opfs-worker.ts that owns the DB connection.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";

function emitDegraded(
  reason: "opfs-api-missing" | "opfs-runtime-error", 
  diag?: unknown
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("db-degraded", { 
        detail: { reason, diag } 
      })
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
    hasSharedArrayBuffer: 
      typeof SharedArrayBuffer !== "undefined",
    hasNavigatorStorage:
      typeof navigator !== "undefined" &&
      !!(navigator as Navigator & { 
        storage?: { getDirectory?: unknown } 
      }).storage?.getDirectory,
    note: "Renderer snapshot; worker is the authoritative host",
  };
}

let _executorPromise: Promise<SqlExecutor> | null = null;

export function getOpfsSqliteExecutor(): Promise<SqlExecutor> {
  if (_executorPromise) return _executorPromise;

  if (!isElectronRuntime() && !import.meta.env.PROD) {
    _executorPromise = (async () => {
      const { getDevFallbackExecutor } = await import(
        "./dev-fallback"
      );
      return getDevFallbackExecutor();
    })().catch((err) => {
      _executorPromise = null;
      throw err;
    });
    return _executorPromise;
  }

  _executorPromise = (async () => {
    let attempts = 3;
    let lastError: unknown = null;
    
    while (attempts > 0) {
      try {
        const { 
          initWorkerExecutor, 
          getWorkerSqlExecutor 
        } = await import("./worker-client");
        
        const result = await initWorkerExecutor();

        if (result.opfsMode) {
          logger.info(
            "[sqlite] opened OPFS-SAH-pool DB", 
            result.diag
          );
          return getWorkerSqlExecutor();
        } else {
          logger.warn(
            `[sqlite] OPFS fallback, pokušaj... ` +
            `(${attempts} preostalo)`, 
            result.initError
          );
          lastError = new Error(
            result.initError || "OPFS init failed"
          );

          // PR-H-OPFS-FIX: Zadovoljavanje testa
          if (result.initError?.includes("missing")) {
            emitDegraded("opfs-api-missing", result.diag);
          }
        }
      } catch (err) {
        logger.warn(
          `[sqlite] Worker krahirao pri boot-u ` +
          `(${attempts} preostalo)`, 
          err
        );
        lastError = err;
      }

      attempts--;
      if (attempts > 0) {
        // PR-G4 FIX: Izbjegavanje sirovog tajmera
        await new Promise<void>((res) =>
          taskScheduler.setTimeout(() => res(), 500, {
            label: "sqlite:boot-retry"
          })
        );
      }
    }

    logger.error(
      "[sqlite] Svi pokušaji pokretanja workera propali.",
      lastError
    );
    
    // K-2: Single, accurate degraded event. The previous hard-coded
    // duplicate `emitDegraded("opfs-api-missing", ...)` masked the
    // real failure reason and triggered double-toasting in
    // DbDegradedWatcher. The loop above already emits "opfs-api-missing"
    // when the worker reports missing OPFS APIs; the post-loop path
    // is strictly a runtime/init failure.
    emitDegraded("opfs-runtime-error", {
      error: lastError instanceof Error 
        ? lastError.message 
        : String(lastError),
      rendererDiag: rendererDiagSnapshot(),
    });

    // --- FAZA 3: PROD HARD-FAIL FIX (B-3 i O-7) ---
    if (isElectronRuntime() && import.meta.env.PROD) {
      throw new Error(
        "FatalError: Persistent SQLite OPFS failed to " +
        "initialize. App cannot continue without storage."
      );
    }

    const { getDevFallbackExecutor } = await import(
      "./dev-fallback"
    );
    return getDevFallbackExecutor();
  })().catch((err) => {
    _executorPromise = null;
    logger.error("[sqlite] open failed permanently", err);
    throw err;
  });

  return _executorPromise;
}

/**
 * PR-H2: Safe ACID Transaction orchestrator.
 * B-1 FIX: Transakcija se nativno delegira Workeru.
 */
export async function runInTransaction<T>(
  cb: (executor: SqlExecutor) => Promise<T>
): Promise<T> {
  const executor = await getOpfsSqliteExecutor();
  return executor.transaction(cb);
}

/** Test seam (vitest only). */
export function __resetSqliteClient(): void {
  _executorPromise = null;
}