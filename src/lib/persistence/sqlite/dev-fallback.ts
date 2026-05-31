/**
 * DEV in-memory SQLite executor — fallback for non-Electron browser preview
 * (e.g. lovable.app, Vite `bun run dev` in a tab). The app is shipped as
 * Pure Desktop, but the preview iframe doesn't run Electron, so without
 * this fallback every write becomes a silent no-op: categories overwrite
 * each other, sources show success toasts but never appear, card mutations
 * eat 1.5 s of retry latency, etc.
 *
 * Durability is explicitly NOT a goal — data evaporates on refresh. The
 * point is that all read/write code paths exercise a real SqlExecutor with
 * the same DDL as production, so functional behaviour matches the desktop
 * build during UI development.
 *
 * PROD non-Electron is still blocked by `assertDesktop()` in `main.tsx`.
 */
import type { SqlBindValue, SqlExecutor, SqlRow } from "./executor";
import { runMigrations } from "./migration-runner";
import { initSqliteWasm } from "./sqlite-init";
import { logger } from "@/lib/logger";

interface SqliteDb {
  exec(opts: { sql: string; bind?: readonly SqlBindValue[]; rowMode?: "object"; returnValue?: "resultRows" }): unknown;
  close(): void;
}
interface SqliteApi {
  oo1: { DB: new (filename: string, flags?: string) => SqliteDb };
}

let _executorPromise: Promise<SqlExecutor> | null = null;
let _loggedOnce = false;

export function getDevFallbackExecutor(): Promise<SqlExecutor> {
  if (_executorPromise) return _executorPromise;
  _executorPromise = (async () => {
    const sqlite3 = await initSqliteWasm<SqliteApi>();
    const db = new sqlite3.oo1.DB(":memory:", "c");
    const exec = wrapDb(db);
    const { from, to } = await runMigrations(exec);
    if (!_loggedOnce) {
      _loggedOnce = true;
      logger.info(
        `[sqlite] DEV in-memory fallback aktivan (migrated ${from} → ${to}). Podaci nestaju na refresh.`,
      );
    }
    return exec;
  })().catch((err) => {
    _executorPromise = null;
    logger.warn("[sqlite] dev-fallback open failed", err);
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

/** Test seam — reset cached singleton. */
export function __resetDevFallback(): void { _executorPromise = null; }
