/**
 * OPFS SQLite client — Worker-backed (PR-H-OPFS-FIX-4).
 * Spawns an opfs-worker.ts that owns the DB connection.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";

/**
 * Dispatch event when VFS degrades.
 */
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
  } catch {
    /* noop */
  }
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
    let attempts = 5;
    let lastError: unknown = null;
    
    // PR-H7 INTERNI ŠTIT: Pokušavamo da probudimo worker 5 puta
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
            `[sqlite] OPFS zauzet, ponovni pokušaj... ` +
            `(${attempts} preostalo)`, 
            result.initError
          );
          lastError = new Error(
            result.initError || "OPFS init failed"
          );
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
        // Čekamo 300ms između pokušaja da se OPFS oslobodi locks-a
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    // Ako svi pokušaji propadnu, tek tada idemo na fallback
    logger.error(
      "[sqlite] Svi pokušaji pokretanja workera su propali.",
      lastError
    );
    
    emitDegraded("opfs-runtime-error", {
      error: lastError instanceof Error 
        ? lastError.message 
        : String(lastError),
      rendererDiag: rendererDiagSnapshot(),
    });

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
 */
export async function runInTransaction<T>(
  cb: (executor: SqlExecutor) => Promise<T>
): Promise<T> {
  const executor = await getOpfsSqliteExecutor();
  let activeTx = false;
  try {
    await executor.exec("BEGIN IMMEDIATE;");
    activeTx = true;
    const result = await cb(executor);
    await executor.exec("COMMIT;");
    activeTx = false;
    return result;
  } catch (err) {
    if (activeTx) {
      try {
        await executor.exec("ROLLBACK;");
      } catch (rollbackErr) {
        logger.error("[sqlite] rollback failed", rollbackErr);
      }
    }
    logger.error("[sqlite] transaction failed", err);
    throw err;
  }
}

/** Test seam (vitest only). */
export function __resetSqliteClient(): void {
  _executorPromise = null;
}