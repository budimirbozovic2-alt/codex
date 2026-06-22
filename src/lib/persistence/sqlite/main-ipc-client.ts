/**
 * Renderer-side SqlExecutor proxy for main-process better-sqlite3 (Faza 5).
 */
import type { SqlBindValue, SqlExecutor, SqlRow } from "./executor";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";
import { withSerialLock, __resetSerialLockForTests } from "./serial-lock";

export interface MainSqliteOpenResult {
  ok: boolean;
  dbPath: string;
}

interface SqliteRpcReply {
  ok: boolean;
  result?: unknown;
  error?: string;
}

type ElectronSqliteApi = {
  sqliteRpc: (payload: Record<string, unknown>) => Promise<SqliteRpcReply>;
};

const DEFAULT_RPC_TIMEOUT_MS = 15000;
const INIT_RPC_TIMEOUT_MS = 90_000;

let isShuttingDown = false;

function getSqliteRpc(): ElectronSqliteApi["sqliteRpc"] {
  const api = (window as Window & { electronAPI?: ElectronSqliteApi })
    .electronAPI;
  if (!api?.sqliteRpc) {
    throw new Error("[sqlite-main] sqliteRpc IPC not exposed in preload");
  }
  return api.sqliteRpc;
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  return withSerialLock(fn);
}

async function rpc<T>(
  payload: Record<string, unknown>,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
): Promise<T> {
  const invoke = getSqliteRpc();
  let timer: ReturnType<typeof taskScheduler.setTimeout> | null = null;

  const reply = await Promise.race([
    invoke(payload),
    new Promise<never>((_resolve, reject) => {
      timer = taskScheduler.setTimeout(
        () => {
          reject(
            new Error(
              `RPC Timeout za operaciju: ${payload.op || "unknown"}`,
            ),
          );
        },
        timeoutMs,
        { label: "sqlite-main:rpc-timeout" },
      );
    }),
  ]);

  if (timer) taskScheduler.cancel(timer);

  if (!reply.ok) {
    throw new Error(reply.error || "[sqlite-main] rpc failed");
  }
  return reply.result as T;
}

export async function initMainSqlite(): Promise<MainSqliteOpenResult> {
  return rpc<MainSqliteOpenResult>({ op: "open" }, INIT_RPC_TIMEOUT_MS);
}

function makeExecutor(txId?: number): SqlExecutor {
  const maybeLock = <T>(fn: () => Promise<T>): Promise<T> => {
    if (txId !== undefined) return fn();
    return withLock(fn);
  };

  const exec: SqlExecutor = {
    run: (sql, params = []) =>
      maybeLock(() =>
        rpc<void>({
          op: "run",
          sql,
          params: Array.from(params),
          txId,
        }),
      ),
    runMany: (sql, batches) =>
      maybeLock(() =>
        rpc<void>({
          op: "runMany",
          sql,
          batches: batches.map((b) => Array.from(b)),
          txId,
        }),
      ),
    all: <T = SqlRow>(
      sql: string,
      params: readonly SqlBindValue[] = [],
    ) =>
      maybeLock(() =>
        rpc<T[]>({
          op: "all",
          sql,
          params: Array.from(params),
          txId,
        }),
      ),
    exec: (sql) =>
      maybeLock(() => rpc<void>({ op: "exec", sql, txId })),
    transaction: async <T,>(
      fn: (tx: SqlExecutor) => Promise<T>,
    ): Promise<T> => {
      if (txId !== undefined) {
        return fn(makeExecutor(txId));
      }
      return withLock(async () => {
        const newTxId = await rpc<number>({ op: "begin" });
        try {
          const result = await fn(makeExecutor(newTxId));
          await rpc<void>({ op: "commit", txId: newTxId });
          return result;
        } catch (err) {
          try {
            await rpc<void>({ op: "rollback", txId: newTxId });
          } catch {
            /* ignore */
          }
          throw err;
        }
      });
    },
    close: async () => {
      /* DB lifetime is tied to the main process */
    },
  };
  return exec;
}

export function getMainSqlExecutor(): SqlExecutor {
  return makeExecutor();
}

export async function awaitShutdownMainSqlite(
  timeoutMs = 10000,
): Promise<void> {
  if (isShuttingDown) return Promise.resolve();
  isShuttingDown = true;
  try {
    await withLock(async () => {});
    await rpc<void>({ op: "shutdown" }, timeoutMs);
  } catch (err) {
    logger.error(
      "[sqlite-main] graceful shutdown failed — data may not be fully flushed",
      err,
    );
  }
}

export function __resetMainIpcClientForTests(): void {
  isShuttingDown = false;
  __resetSerialLockForTests();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    void awaitShutdownMainSqlite(8000);
  });
  window.addEventListener("pagehide", () => {
    void awaitShutdownMainSqlite(8000);
  });
}
