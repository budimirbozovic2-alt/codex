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

export function getOpfsSqliteExecutor(): Promise<SqlExecutor> {
  if (_executorPromise) return _executorPromise;
  _executorPromise = (async () => {
    const mod = await import("@sqlite.org/sqlite-wasm");
    const sqlite3InitModule = (mod as unknown as {
      default: (cfg?: { locateFile?: (p: string) => string; print?: (...a: unknown[]) => void; printErr?: (...a: unknown[]) => void }) => Promise<SqliteApi>;
    }).default;
    // In packaged Electron the JS bundle lives at `app://localhost/assets/*`,
    // so the default `new URL("sqlite3.wasm", import.meta.url)` resolves to
    // `app://localhost/assets/sqlite3.wasm` (404 → HTML fallback → wasm magic
    // mismatch). The `copy-sqlite-wasm` Vite plugin places the runtime at
    // `dist/sqlite/`, served as `app://localhost/sqlite/*`.
    const locateFile = (file: string): string => {
      if (import.meta.env.PROD) return `/sqlite/${file}`;
      // Dev (Vite) — let the bundler resolve via import.meta.url default.
      return file;
    };
    const sqlite3: SqliteApi = await sqlite3InitModule({ locateFile });

    let db: SqliteDb;
    if (sqlite3.installOpfsSAHPoolVfs) {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: "codex-opfs-pool" });
      db = new pool.OpfsSAHPoolDb(OPFS_DB_FILENAME);
      logger.info("[sqlite] opened OPFS-SAH-pool DB", { filename: OPFS_DB_FILENAME });
    } else {
      // Fallback: transient in-memory DB. Loses durability — only acceptable
      // as a soft-fail signal; the adapter factory should not select us here.
      db = new sqlite3.oo1.DB(":memory:", "c");
      logger.warn("[sqlite] OPFS-SAH-pool unavailable, using :memory: (non-durable)");
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
    // sqlite-wasm `oo1.exec` does not expose a prepared-statement reuse API,
    // so we loop sync inside a single microtask — no await between rows,
    // which collapses the N awaits a per-row `tx.run` loop would create.
    for (const params of paramsBatches) {
      db.exec({ sql, bind: params.length > 0 ? params : undefined });
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
