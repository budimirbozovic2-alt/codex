/**
 * Renderer-side proxy for the OPFS SQLite worker.
 *
 * Implements the `SqlExecutor` contract by forwarding every call
 * to `opfs-worker.ts` over a small request/response RPC.
 */
import type { 
  SqlBindValue, SqlExecutor, SqlRow 
} from "./executor";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";
import { withSerialLock, __resetSerialLockForTests } from "./serial-lock";

export interface WorkerInitResult {
  opfsMode: boolean;
  initError: string | null;
  diag: Record<string, unknown> | null;
}

interface WorkerReply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

type PendingMap = Map<
  number,
  { resolve: (v: unknown) => void; reject: (e: Error) => void }
>;

let worker: Worker | null = null;
let isShuttingDown = false;
let msgId = 0;
const pending: PendingMap = new Map();
const RPC_TIMEOUT_MS = 15000;

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  return withSerialLock(fn);
}

function emitDegraded(
  reason: "opfs-runtime-error",
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

function terminateAndRejectAll(reason: string): void {
  emitDegraded("opfs-runtime-error", { error: reason });
  const errorObj = new Error(`[sqlite-rpc] ${reason}`);
  
  for (const p of pending.values()) {
    try { p.reject(errorObj); } catch { /* swallow */ }
  }
  pending.clear();
  
  try { worker?.terminate(); } catch { /* idempotent */ }
  worker = null;
}

function getWorker(): Worker {
  if (isShuttingDown) {
    throw new Error("Aplikacija se gasi, nemoguće instancirati novog workera.");
  }
  if (worker) return worker;
  
  worker = new Worker(
    new URL("./opfs-worker.ts", import.meta.url), 
    { type: "module" }
  );
  
  worker.addEventListener(
    "message",
    (ev: MessageEvent<WorkerReply>) => {
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
    terminateAndRejectAll(`Worker krah: ${e.message}`);
  });
  
  worker.addEventListener("messageerror", (e: MessageEvent) => {
    logger.error("[opfs-worker] messageerror event", e);
    terminateAndRejectAll("Worker serijalizacijska greska");
  });
  
  return worker;
}

function rpc<T>(payload: Record<string, unknown>): Promise<T> {
  const w = getWorker();
  const id = ++msgId;
  
  return new Promise<T>((resolve, reject) => {
    const timer = taskScheduler.setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(
          new Error(
            `RPC Timeout za operaciju: ${payload.op || "unknown"}`
          )
        );
      }
    }, RPC_TIMEOUT_MS, { label: "sqlite:rpc-timeout" });

    pending.set(id, {
      resolve: (v: unknown) => {
        taskScheduler.cancel(timer);
        (resolve as (v: unknown) => void)(v);
      },
      reject: (e: Error) => {
        taskScheduler.cancel(timer);
        reject(e);
      },
    });
    w.postMessage({ id, ...payload });
  });
}

export async function initWorkerExecutor(): Promise<WorkerInitResult> {
  return rpc<WorkerInitResult>({ op: "init" });
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
          } catch { /* ignore */ }
          throw err;
        }
      });
    },
    close: async () => {
      /* worker stays alive for the renderer's lifetime */
    },
  };
  return exec;
}

export function getWorkerSqlExecutor(): SqlExecutor {
  return makeExecutor();
}

function __resetWorkerClient(): void {
  try {
    worker?.terminate();
  } catch { /* noop */ }
  worker = null;
  isShuttingDown = false;
  __resetSerialLockForTests();
  pending.clear();
  msgId = 0;
}

function shutdownWorker(w: Worker): void {
  void withSerialLock(async () => {}).finally(() => {
    try {
      w.postMessage({ id: ++msgId, op: "shutdown" });
    } catch { /* noop */ }
  });
}

function rejectPendingOnShutdown(reason: string): void {
  const shutdownErr = new Error(`[sqlite-rpc] ${reason}`);
  for (const p of pending.values()) {
    try { p.reject(shutdownErr); } catch { /* swallow */ }
  }
  pending.clear();
}

// Graceful shutdown — drain renderer lock, then queue db.close() in the worker.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    isShuttingDown = true;
    const w = worker;
    if (!w) return;
    worker = null;
    shutdownWorker(w);
    rejectPendingOnShutdown("Worker shutdown on beforeunload");
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    isShuttingDown = true;
    const w = worker;
    if (!w) return;
    worker = null;
    shutdownWorker(w);
    try { w.terminate(); } catch { /* worker may already be gone */ }
    rejectPendingOnShutdown("Worker shutdown on HMR dispose");
  });
}