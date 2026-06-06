/**
 * OPFS SQLite client — Worker-backed (PR-H-OPFS-FIX-4).
 *
 * The OPFS SAH-pool VFS requires `FileSystemFileHandle.prototype.createSyncAccessHandle`,
 * which sqlite.org's docs note is only reliably exposed inside a Worker
 * context — NOT the renderer main thread. The previous implementation
 * instantiated the VFS from the main thread, which failed with
 * "Missing required OPFS APIs" in both Electron dev and packaged builds
 * even with COOP/COEP/CORP correctly set.
 *
 * This module now spawns a dedicated `opfs-worker.ts` that owns the
 * SQLite connection and serves a small RPC contract. The returned
 * `SqlExecutor` is a renderer-side proxy that preserves the existing
 * transaction semantics (BEGIN/COMMIT/ROLLBACK with a worker-side lock).
 *
 * Failure modes:
 *   • Worker init fails entirely → fall back to renderer in-memory DB and
 *     emit `db-degraded` event so the toast surfaces to the user.
 *   • Worker boots but OPFS install fails inside the worker → worker
 *     transparently uses `:memory:`; renderer reads `opfsMode=false` from
 *     the init reply and still emits `db-degraded`.
 *
 * Non-Electron DEV preview keeps the existing in-renderer in-memory
 * fallback so `bun run dev` in a browser tab continues to function for
 * UI development. Non-Electron PROD is gated upstream by the
 * desktop-only CTA in `main.tsx`.
 */
import type { SqlExecutor } from "./executor";
import { logger } from "@/lib/logger";

/**
 * PR-H-OPFS-FIX: dispatch a window event when SQLite cannot use the durable
 * OPFS-SAH-pool VFS and falls back to an in-memory executor. Bridged to a
 * blocking sonner toast by `DbDegradedWatcher` mounted in `App.tsx`. Without
 * this signal, the renderer silently writes to a non-persistent store and
 * the user only discovers data loss on the next restart.
 *
 * Diagnostic keys preserved verbatim (crossOriginIsolated, hasSharedArrayBuffer)
 * so existing regression tests keep matching this file.
 */
function emitDegraded(reason: "opfs-api-missing" | "opfs-runtime-error", diag?: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("db-degraded", { detail: { reason, diag } }));
  } catch {
    /* noop */
  }
}

function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as { electronAPI?: unknown }).electronAPI);
}

function rendererDiagSnapshot(): Record<string, unknown> {
  return {
    crossOriginIsolated:
      typeof self !== "undefined"
        ? (self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated
        : undefined,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    hasNavigatorStorage:
      typeof navigator !== "undefined" &&
      !!(navigator as Navigator & { storage?: { getDirectory?: unknown } }).storage?.getDirectory,
    note: "renderer-thread snapshot; worker is the authoritative OPFS host",
  };
}

let _executorPromise: Promise<SqlExecutor> | null = null;

export function getOpfsSqliteExecutor(): Promise<SqlExecutor> {
  if (_executorPromise) return _executorPromise;

  // Non-Electron DEV preview (lovable.app, `bun run dev` in a tab): use a
  // real in-memory SQLite executor so writes actually persist within the
  // session. See `dev-fallback.ts` for the rationale. Non-Electron PROD is
  // blocked upstream by the desktop-only CTA in main.tsx.
  if (!isElectronRuntime() && !import.meta.env.PROD) {
    _executorPromise = (async () => {
      const { getDevFallbackExecutor } = await import("./dev-fallback");
      return getDevFallbackExecutor();
    })().catch((err) => {
      _executorPromise = null;
      throw err;
    });
    return _executorPromise;
  }

  // Electron (dev or prod): spawn the OPFS worker and proxy through it.
  _executorPromise = (async () => {
    try {
      const { initWorkerExecutor, getWorkerSqlExecutor } = await import("./worker-client");
      const result = await initWorkerExecutor();

      if (result.opfsMode) {
        logger.info("[sqlite] opened OPFS-SAH-pool DB via worker", result.diag);
      } else {
        logger.error("[sqlite] worker could not install OPFS VFS — running in-memory inside worker", {
          error: result.initError,
          diag: result.diag,
        });
        const reason: "opfs-api-missing" | "opfs-runtime-error" =
          result.initError && /undefined|Missing required OPFS APIs/i.test(result.initError)
            ? "opfs-api-missing"
            : "opfs-runtime-error";
        emitDegraded(reason, result);
      }

      return getWorkerSqlExecutor();
    } catch (err) {
      // Worker itself failed to even boot — fall back to renderer-side
      // in-memory executor so the app keeps running with a clear warning.
      logger.error("[sqlite] OPFS worker boot failed entirely; using renderer in-memory", err);
      emitDegraded("opfs-runtime-error", {
        error: err instanceof Error ? err.message : String(err),
        rendererDiag: rendererDiagSnapshot(),
      });
      const { getDevFallbackExecutor } = await import("./dev-fallback");
      return getDevFallbackExecutor();
    }
  })().catch((err) => {
    _executorPromise = null;
    logger.warn("[sqlite] open failed", err);
    throw err;
  });
  return _executorPromise;
}

/** Test seam — reset cached singleton (vitest only). */
export function __resetSqliteClient(): void {
  _executorPromise = null;
}

