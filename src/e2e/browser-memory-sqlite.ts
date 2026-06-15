/**
 * E2E-only in-memory SQLite executor (main thread).
 * Playwright headless Chromium cannot initialise OPFS — this path keeps
 * real wasm SQLite + migrations without the worker/OPFS stack.
 */
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { runMigrations } from "@/lib/persistence/sqlite/migration-runner";
import type { SqlBindValue, SqlExecutor, SqlRow } from "@/lib/persistence/sqlite/executor";

interface SqliteDb {
  exec(opts: {
    sql: string;
    bind?: readonly SqlBindValue[];
    rowMode?: "object";
    returnValue?: "resultRows";
  }): unknown;
  close(): void;
}

interface SqliteApi {
  oo1: {
    DB: new (filename: string, flags?: string) => SqliteDb;
  };
}

let db: SqliteDb | null = null;
let executor: SqlExecutor | null = null;

function runSql(sql: string, params?: readonly SqlBindValue[]): void {
  if (!db) throw new Error("E2E db not initialised");
  db.exec({
    sql,
    bind: params && params.length > 0 ? (params as SqlBindValue[]) : undefined,
  });
}

function allSql(sql: string, params?: readonly SqlBindValue[]): SqlRow[] {
  if (!db) throw new Error("E2E db not initialised");
  const res = db.exec({
    sql,
    bind: params && params.length > 0 ? (params as SqlBindValue[]) : undefined,
    rowMode: "object",
    returnValue: "resultRows",
  }) as { resultRows?: SqlRow[] } | SqlRow[] | undefined;
  if (Array.isArray(res)) return res;
  return res?.resultRows ?? [];
}

function execScript(sql: string): void {
  if (!db) throw new Error("E2E db not initialised");
  db.exec({ sql });
}

function makeExecutor(): SqlExecutor {
  const local: SqlExecutor = {
    run: async (sql, params) => { runSql(sql, params); },
    runMany: async (sql, batches) => {
      for (const p of batches) runSql(sql, p);
    },
    all: async <T = SqlRow>(sql: string, params?: readonly SqlBindValue[]) =>
      allSql(sql, params) as T[],
    exec: async (sql) => { execScript(sql); },
    transaction: async <T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
      execScript("BEGIN IMMEDIATE");
      try {
        const result = await fn(local);
        execScript("COMMIT");
        return result;
      } catch (e) {
        try { execScript("ROLLBACK"); } catch { /* noop */ }
        throw e;
      }
    },
    close: async () => {
      try { db?.close(); } catch { /* idempotent */ }
    },
  };
  return local;
}

export async function createE2eMemoryExecutor(): Promise<SqlExecutor> {
  if (executor) return executor;

  const mod = await import("@sqlite.org/sqlite-wasm");
  const initFn = (
    mod as unknown as {
      default: (opts?: { locateFile?: (f: string) => string }) => Promise<SqliteApi>;
    }
  ).default;

  const sqlite3 = await initFn({
    locateFile: (file: string) => {
      if (file === "sqlite3.wasm") return sqliteWasmUrl;
      return new URL(file, sqliteWasmUrl).toString();
    },
  });

  db = new sqlite3.oo1.DB(":memory:", "c");
  const exec = makeExecutor();
  await exec.exec("PRAGMA foreign_keys = ON;");
  await runMigrations(exec);
  executor = exec;
  return executor;
}
