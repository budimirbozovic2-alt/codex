/// <reference lib="webworker" />
/**
 * Worker-backed SQLite/OPFS executor.
 */
import sqliteWasmUrl from 
  "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";
import { runMigrations } from "./migration-runner";
import type { 
  SqlBindValue, SqlExecutor, SqlRow 
} from "./executor";

interface SqliteDb {
  exec(opts: { 
    sql: string; 
    bind?: readonly SqlBindValue[]; 
    rowMode?: "object"; 
    returnValue?: "resultRows" 
  }): unknown;
  close(): void;
}
interface SqliteApi {
  oo1: {
    OpfsSAHPoolDb?: new (filename: string) => SqliteDb;
    DB: new (filename: string, flags?: string) => SqliteDb;
  };
  installOpfsSAHPoolVfs?: (opts?: { 
    name?: string;
    forceReinitIfPreviouslyFailed?: boolean;
  }) => Promise<{ 
    OpfsSAHPoolDb: new (filename: string) => SqliteDb 
  }>;
}

interface WorkerDiag {
  crossOriginIsolated: boolean | undefined;
  hasSharedArrayBuffer: boolean;
  hasNavigatorStorage: boolean;
  hasFileSystemHandle: boolean;
  hasFileSystemDirectoryHandle: boolean;
  hasFileSystemFileHandle: boolean;
  hasSyncAccessHandle: boolean;
  hasInstallOpfsSAHPoolVfs: boolean;
}

interface GlobalScopeProbe {
  FileSystemHandle?: unknown;
  FileSystemDirectoryHandle?: unknown;
  FileSystemFileHandle?: { 
    prototype?: { createSyncAccessHandle?: unknown } 
  };
}

const OPFS_DB_FILENAME = "/codex.sqlite3";

let db: SqliteDb | null = null;
let opfsMode = false;
let initError: string | null = null;
let diagSnapshot: WorkerDiag | null = null;

const setObscuredTimeout: (
  handler: () => void, timeout?: number
) => number = self.setTimeout.bind(self);
const clearObscuredTimeout: (handle: number) => void =
  self.clearTimeout.bind(self);

function probeDiag(api?: SqliteApi): WorkerDiag {
  const g = globalThis as unknown as GlobalScopeProbe;
  const fileHandle = g.FileSystemFileHandle;
  return {
    crossOriginIsolated: 
      typeof self !== "undefined"
        ? (self as WorkerGlobalScope & { crossOriginIsolated?: boolean }).crossOriginIsolated
        : undefined,
    hasSharedArrayBuffer: 
      typeof SharedArrayBuffer !== "undefined",
    hasNavigatorStorage:
      typeof navigator !== "undefined" && 
      typeof navigator.storage?.getDirectory 
        === "function",
    hasFileSystemHandle: 
      typeof g.FileSystemHandle !== "undefined",
    hasFileSystemDirectoryHandle: 
      typeof g.FileSystemDirectoryHandle !== "undefined",
    hasFileSystemFileHandle: 
      typeof fileHandle !== "undefined",
    hasSyncAccessHandle:
      typeof fileHandle !== "undefined" &&
      typeof fileHandle.prototype?.createSyncAccessHandle 
        === "function",
    hasInstallOpfsSAHPoolVfs: !!api?.installOpfsSAHPoolVfs,
  };
}

function runSql(
  sql: string, 
  params?: readonly SqlBindValue[]
): void {
  if (!db) throw new Error("db not initialised");
  db.exec({ 
    sql, 
    bind: params && params.length > 0 
      ? (params as SqlBindValue[]) : undefined 
  });
}

function allSql(
  sql: string, 
  params?: readonly SqlBindValue[]
): SqlRow[] {
  if (!db) throw new Error("db not initialised");
  const res = db.exec({
    sql,
    bind: params && params.length > 0 
      ? (params as SqlBindValue[]) : undefined,
    rowMode: "object",
    returnValue: "resultRows",
  }) as { resultRows?: SqlRow[] } | SqlRow[] | undefined;
  if (Array.isArray(res)) return res;
  return res?.resultRows ?? [];
}

function execScript(sql: string): void {
  if (!db) throw new Error("db not initialised");
  db.exec({ sql });
}

function makeLocalExecutor(): SqlExecutor {
  const local: SqlExecutor = {
    run: async (sql, params) => { runSql(sql, params); },
    runMany: async (sql, batches) => {
      for (const p of batches) runSql(sql, p);
    },
    all: async <T = SqlRow>(
      sql: string, 
      params?: readonly SqlBindValue[]
    ) => allSql(sql, params) as T[],
    exec: async (sql) => { execScript(sql); },
    transaction: async <T,>(
      fn: (tx: SqlExecutor) => Promise<T>
    ): Promise<T> => {
      execScript("BEGIN IMMEDIATE");
      try {
        const r = await fn(local);
        execScript("COMMIT");
        return r;
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

let initPromise: Promise<void> | null = null;

async function initDb(): Promise<void> {
  const mod = await import("@sqlite.org/sqlite-wasm");
  const initFn = (
    mod as unknown as { 
      default: (opts?: { 
        locateFile?: (f: string) => string 
      }) => Promise<SqliteApi> 
    }
  ).default;
  
  const sqlite3 = await initFn({
    locateFile: (file: string) => {
      if (file === "sqlite3.wasm") return sqliteWasmUrl;
      return new URL(file, sqliteWasmUrl).toString();
    },
  });

  diagSnapshot = probeDiag(sqlite3);

  if (sqlite3.installOpfsSAHPoolVfs) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ 
        name: "codex-opfs-pool",
        forceReinitIfPreviouslyFailed: true 
      });
      db = new pool.OpfsSAHPoolDb(OPFS_DB_FILENAME);
      opfsMode = true;
      initError = null;
    } catch (e) {
      throw new Error(
        `OPFS SAH-pool install failed: ` +
        `${e instanceof Error ? e.message : String(e)}`
      );
    }
  } else {
    throw new Error(
      "Missing required OPFS APIs " +
      "(installOpfsSAHPoolVfs is undefined)"
    );
  }

  const exec = makeLocalExecutor();
  await exec.exec("PRAGMA foreign_keys = ON;");
  await runMigrations(exec);
  
  if (opfsMode) {
    try {
      await exec.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch { /* WAL not supported on SAH-pool VFS */ }
  }
}

// ── RPC server ──
type Req =
  | { id: number; op: "init" }
  | { 
      id: number; op: "run"; sql: string; 
      params: SqlBindValue[]; txId?: number 
    }
  | { 
      id: number; op: "runMany"; sql: string; 
      batches: SqlBindValue[][]; txId?: number 
    }
  | { 
      id: number; op: "all"; sql: string; 
      params: SqlBindValue[]; txId?: number 
    }
  | { id: number; op: "exec"; sql: string; txId?: number }
  | { id: number; op: "begin" }
  | { id: number; op: "commit"; txId: number }
  | { id: number; op: "rollback"; txId: number }
  | { id: number; op: "shutdown" }; // B-5/S-1 FIX: dodato u typ

type Reply = 
  | { id: number; ok: true; result?: unknown } 
  | { id: number; ok: false; error: string };

function reply(msg: Reply): void {
  (self as unknown as Worker).postMessage(msg);
}

interface QueueItem {
  msgId: number;
  task: () => Promise<void>;
  txId: number | undefined;
}

let currentTxId: number | null = null;
let txCounter = 0;
let processing = false;
const queue: QueueItem[] = [];

let txWatchdogTimer: number | null = null;
const TX_TIMEOUT_MS = 10000;

function clearTxWatchdog(): void {
  if (txWatchdogTimer) {
    clearObscuredTimeout(txWatchdogTimer);
    txWatchdogTimer = null;
  }
}

function purgeTx(txId: number, reason: string): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].txId === txId) {
      const [item] = queue.splice(i, 1);
      try {
        reply({
          id: item.msgId,
          ok: false,
          error: `[opfs-worker] ${reason} (txId=${txId})`,
        });
      } catch { /* noop */ }
    }
  }
}

function startTxWatchdog(txId: number): void {
  clearTxWatchdog();
  txWatchdogTimer = setObscuredTimeout(() => {
    if (currentTxId === txId) {
      try {
        execScript("ROLLBACK");
      } catch { /* noop */ }
      currentTxId = null;
      clearTxWatchdog();
      purgeTx(txId, "Transaction watchdog rollback");
      void pump();
    }
  }, TX_TIMEOUT_MS);
}

function refreshTxWatchdog(txId: number): void {
  if (currentTxId === txId) {
    startTxWatchdog(txId);
  }
}

function isRunnable(item: QueueItem): boolean {
  if (currentTxId === null) return true;
  return item.txId === currentTxId;
}

async function pump(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (queue.length > 0) {
      const idx = queue.findIndex(isRunnable);
      if (idx === -1) break; 
      const [item] = queue.splice(idx, 1);
      try {
        await item.task();
      } catch { /* bublanje preko reply() */ }
    }
  } finally {
    processing = false;
  }
}

function schedule(
  msgId: number,
  txId: number | undefined,
  task: () => Promise<void>
): void {
  queue.push({ msgId, task, txId });
  void pump();
}

self.addEventListener("message", (ev: MessageEvent<Req>) => {
  const msg = ev.data;
  void (async () => {
    try {
      if (msg.op === "shutdown") {
        // Enqueue shutdown as the very last task so every in-flight write
        // commits before the DB file is released. If the DB was never
        // initialised we reply immediately without touching the queue.
        if (!initPromise) {
          reply({ id: msg.id, ok: true });
          self.close();
          return;
        }
        // Wait for init to settle (success or failure), then join the queue.
        await initPromise.catch(() => { /* ignore init error */ });
        schedule(msg.id, undefined, async () => {
          clearTxWatchdog();
          if (currentTxId !== null) {
            try { execScript("ROLLBACK"); } catch { /* noop */ }
            currentTxId = null;
          }
          try { if (db) db.close(); } catch { /* idempotent */ }
          reply({ id: msg.id, ok: true });
          self.close();
        });
        return;
      }

      if (msg.op === "init") {
        if (!initPromise) {
          initPromise = initDb().catch((err) => {
            initPromise = null; 
            throw err;
          });
        }
        await initPromise;
        return reply({
          id: msg.id,
          ok: true,
          result: { 
            opfsMode, 
            initError, 
            diag: diagSnapshot 
          },
        });
      }

      if (!initPromise) {
        initPromise = initDb().catch(e => {
          initPromise = null;
          throw e;
        });
      }
      await initPromise;

      switch (msg.op) {
        case "begin":
          schedule(msg.id, undefined, async () => {
            try {
              execScript("BEGIN IMMEDIATE");
              const newId = ++txCounter;
              currentTxId = newId;
              startTxWatchdog(newId);
              reply({ id: msg.id, ok: true, result: newId });
            } catch (e) {
              reply({ 
                id: msg.id, ok: false, 
                error: e instanceof Error 
                  ? e.message 
                  : String(e) 
              });
            }
          });
          return;
          
        case "commit":
          schedule(msg.id, msg.txId, async () => {
            try {
              execScript("COMMIT");
              reply({ id: msg.id, ok: true });
            } catch (e) {
              reply({ 
                id: msg.id, ok: false, 
                error: e instanceof Error 
                  ? e.message 
                  : String(e) 
              });
            } finally {
              if (currentTxId === msg.txId) {
                currentTxId = null;
                clearTxWatchdog();
              }
              void pump(); 
            }
          });
          return;
          
        case "rollback":
          schedule(msg.id, msg.txId, async () => {
            try { execScript("ROLLBACK"); } catch { /* noop */ }
            if (currentTxId === msg.txId) {
              currentTxId = null;
              clearTxWatchdog();
            }
            reply({ id: msg.id, ok: true });
            void pump();
          });
          return;
          
        case "run":
          schedule(msg.id, msg.txId, async () => {
            try {
              refreshTxWatchdog(msg.txId ?? 0);
              runSql(msg.sql, msg.params);
              reply({ id: msg.id, ok: true });
            } catch (e) {
              reply({ 
                id: msg.id, ok: false, 
                error: e instanceof Error 
                  ? e.message 
                  : String(e) 
              });
            }
          });
          return;
          
        case "runMany":
          schedule(msg.id, msg.txId, async () => {
            try {
              refreshTxWatchdog(msg.txId ?? 0);
              for (const p of msg.batches) runSql(msg.sql, p);
              reply({ id: msg.id, ok: true });
            } catch (e) {
              reply({ 
                id: msg.id, ok: false, 
                error: e instanceof Error 
                  ? e.message 
                  : String(e) 
              });
            }
          });
          return;
          
        case "all":
          schedule(msg.id, msg.txId, async () => {
            try {
              refreshTxWatchdog(msg.txId ?? 0);
              const rows = allSql(msg.sql, msg.params);
              reply({ id: msg.id, ok: true, result: rows });
            } catch (e) {
              reply({ 
                id: msg.id, ok: false, 
                error: e instanceof Error 
                  ? e.message 
                  : String(e) 
              });
            }
          });
          return;
          
        case "exec":
          schedule(msg.id, msg.txId, async () => {
            try {
              refreshTxWatchdog(msg.txId ?? 0);
              execScript(msg.sql);
              reply({ id: msg.id, ok: true });
            } catch (e) {
              reply({ 
                id: msg.id, ok: false, 
                error: e instanceof Error 
                  ? e.message 
                  : String(e) 
              });
            }
          });
          return;
      }
    } catch (e) {
      reply({ 
        id: msg.id, ok: false, 
        error: e instanceof Error ? e.message : String(e) 
      });
    }
  })();
});

export {};