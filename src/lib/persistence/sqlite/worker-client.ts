/**
 * Renderer-side proxy for the OPFS SQLite worker.
 *
 * Implements the `SqlExecutor` contract by forwarding every call to
 * `opfs-worker.ts` over a small request/response RPC. Transaction semantics
 * are preserved: `transaction(fn)` issues a `begin` RPC, calls `fn` with a
 * txId-scoped executor, then issues `commit` (or `rollback` on throw).
 * Nested `transaction(fn)` inside an already-open transaction reuses the
 * outer txId without a fresh BEGIN, matching the SAVEPOINT-free behaviour
 * of the prior renderer-side wrapper.
 */
import type { SqlBindValue, SqlExecutor, SqlRow } from "./executor";
import { logger } from "@/lib/logger";

export interface WorkerInitResult {
  opfsMode: boolean;
  initError: string | null;
  diag: Record<string, unknown> | null;
}

type PendingMap = Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>;

let worker: Worker | null = null;
let msgId = 0;
const pending: PendingMap = new Map();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./opfs-worker.ts", import.meta.url), { type: "module" });
  worker.addEventListener(
    "message",
    (ev: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const m = ev.data;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.result);
      else p.reject(new Error(m.error || "worker error"));
    },
  );
  worker.addEventListener("error", (e: ErrorEvent) => {
    logger.error("[opfs-worker] error event", e.message || e);
  });
  worker.addEventListener("messageerror", (e: MessageEvent) => {
    logger.error("[opfs-worker] messageerror event", e);
  });
  return worker;
}

function rpc<T>(payload: Record<string, unknown>): Promise<T> {
  const w = getWorker();
  const id = ++msgId;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    w.postMessage({ id, ...payload });
  });
}

/** One-time worker boot + return the init diagnostics. */
export async function initWorkerExecutor(): Promise<WorkerInitResult> {
  return rpc<WorkerInitResult>({ op: "init" });
}

function makeExecutor(txId?: number): SqlExecutor {
  const exec: SqlExecutor = {
    run: (sql, params = []) =>
      rpc<void>({ op: "run", sql, params: Array.from(params), txId }),
    runMany: (sql, batches) =>
      rpc<void>({
        op: "runMany",
        sql,
        batches: batches.map((b) => Array.from(b)),
        txId,
      }),
    all: <T = SqlRow>(sql: string, params: readonly SqlBindValue[] = []) =>
      rpc<T[]>({ op: "all", sql, params: Array.from(params), txId }),
    exec: (sql) => rpc<void>({ op: "exec", sql, txId }),
    transaction: async <T,>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> => {
      if (txId !== undefined) {
        // Nested — run inline against the same tx, matching prior semantics.
        return fn(makeExecutor(txId));
      }
      const newTxId = await rpc<number>({ op: "begin" });
      try {
        const result = await fn(makeExecutor(newTxId));
        await rpc<void>({ op: "commit", txId: newTxId });
        return result;
      } catch (err) {
        try {
          await rpc<void>({ op: "rollback", txId: newTxId });
        } catch {
          /* already rolled back */
        }
        throw err;
      }
    },
    close: async () => {
      /* worker stays alive for the renderer's lifetime; nothing to free */
    },
  };
  return exec;
}

export function getWorkerSqlExecutor(): SqlExecutor {
  return makeExecutor();
}

/** Test seam — clear cached worker + pending RPCs. */
export function __resetWorkerClient(): void {
  try {
    worker?.terminate();
  } catch {
    /* noop */
  }
  worker = null;
  pending.clear();
  msgId = 0;
}
