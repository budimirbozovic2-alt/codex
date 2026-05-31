/**
 * OPFS SQLite client — PR-8 M1.
 *
 * Lazily instantiates `@sqlite.org/sqlite-wasm` with the OPFS-SAH-pool VFS in
 * a dedicated worker. Returns a `SqlExecutor` wrapping the wasm `oo1.DB`
 * handle. Open is idempotent; the same Promise is returned to all callers
 * across the lifetime of the page.
 *
 * Failure modes (wasm load failure, OPFS unavailable, quota exhaustion) are
 * surfaced as rejected promises so the adapter factory can fall back to the
 * IDB adapter and the boot DAG can keep going. This module never throws at
 * import time.
 *
 * In non-Electron / SSR / test contexts the wasm runtime is not loaded — use
 * `createInMemoryExecutor()` for unit tests.
 */
import type { SqlBindValue, SqlExecutor, SqlRow } from "./executor";
import { runMigrations } from "./migration-runner";
import { logger } from "@/lib/logger";

const OPFS_DB_FILENAME = "/codex.sqlite3";

// `@sqlite.org/sqlite-wasm` ships its own typings but they require DOM-only
// types; we re-declare the slim surface we touch to keep this file portable.
interface SqliteDb {
  exec(opts: { sql: string; bind?: readonly SqlBindValue[]; rowMode?: "object"; returnValue?: "resultRows" }): unknown;
  close(): void;
}
interface SqliteApi {
  oo1: {
    OpfsSAHPoolDb?: new (filename: string) => SqliteDb;
    DB: new (filename: string, flags?: string) => SqliteDb;
  };
  installOpfsSAHPoolVfs?: (opts?: { name?: string }) => Promise<{ OpfsSAHPoolDb: new (filename: string) => SqliteDb }>;
}

let _executorPromise: Promise<SqlExecutor> | null = null;

function isElectronRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as { electronAPI?: unknown }).electronAPI);
}

export function getOpfsSqliteExecutor(): Promise<SqlExecutor> {
  if (_executorPromise) return _executorPromise;
  // Non-Electron DEV preview (lovable.app, `bun run dev` in a tab): use a
  // real in-memory SQLite executor so writes actually persist within the
  // session. See `dev-fallback.ts` for the rationale.
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
  _executorPromise = (async () => {
    const { initSqliteWasm } = await import("./sqlite-init");
    const sqlite3: SqliteApi = await initSqliteWasm<SqliteApi>();

    let db: SqliteDb;
    if (sqlite3.installOpfsSAHPoolVfs) {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "codex-opfs-pool" });
      db = new pool.OpfsSAHPoolDb(OPFS_DB_FILENAME);
      logger.info("[sqlite] opened OPFS-SAH-pool DB", { filename: OPFS_DB_FILENAME });
    } else {
      // Wave-1 fix: previously fell through to a transient `:memory:` DB.
      // That silently substituted a non-durable backend (all writes lost on
      // reload) with no signal to callers. Reject so the persist queue
      // surfaces NO_EXECUTOR and the recovery UI warns the user instead.
      logger.error("[sqlite] OPFS-SAH-pool VFS unavailable — refusing :memory: fallback");
      throw new Error("OPFS_UNAVAILABLE");
    }

    const exec = wrapDb(db);
    const { from, to } = await runMigrations(exec);
    if (from !== to) logger.info(`[sqlite] migrated user_version ${from} → ${to}`);
    await exec.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    return exec;
  })().catch((err) => {
    _executorPromise = null;
    logger.warn("[sqlite] open failed", err);
    throw err;
  });
  return _executorPromise;
}

interface ExecResult { resultRows?: SqlRow[] }

function wrapDb(db: SqliteDb): SqlExecutor {
  const run = async (sql: string, params: readonly SqlBindValue[] = []): Promise<void> => {
    db.exec({ sql, bind: params.length > 0 ? params : undefined });
  };
  const runMany = async (
    sql: string,
    paramsBatches: readonly (readonly SqlBindValue[])[],
  ): Promise<void> => {
    // Wave-1 fix: previously looped raw `db.exec` with NO transaction. If
    // a single statement threw at row N, rows 1..N-1 stayed committed and
    // N+1..end were lost — no atomicity at the bulk-write boundary. Wrap
    // the batch in an explicit BEGIN/COMMIT so a failure rolls back whole.
    db.exec({ sql: "BEGIN" });
    try {
      for (const params of paramsBatches) {
        db.exec({ sql, bind: params.length > 0 ? params : undefined });
      }
      db.exec({ sql: "COMMIT" });
    } catch (err) {
      try { db.exec({ sql: "ROLLBACK" }); } catch { /* already rolled back */ }
      throw err;
    }
  };
  const all = async <T = SqlRow>(sql: string, params: readonly SqlBindValue[] = []): Promise<T[]> => {
    const result = db.exec({
      sql,
      bind: params.length > 0 ? params : undefined,
      rowMode: "object",
      returnValue: "resultRows",
    }) as ExecResult | SqlRow[] | undefined;
    if (Array.isArray(result)) return result as T[];
    return ((result?.resultRows ?? []) as unknown) as T[];
  };
  const exec = async (sql: string): Promise<void> => { db.exec({ sql }); };
  const transaction = async <T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
    await exec("BEGIN");
    try {
      const result = await fn({ run, runMany, all, exec, transaction, close });
      await exec("COMMIT");
      return result;
    } catch (err) {
      try { await exec("ROLLBACK"); } catch { /* already rolled back */ }
      throw err;
    }
  };
  const close = async (): Promise<void> => { try { db.close(); } catch { /* idempotent */ } };
  return { run, runMany, all, exec, transaction, close };
}


/** Test seam — reset cached singleton (vitest only). */
export function __resetSqliteClient(): void { _executorPromise = null; }
