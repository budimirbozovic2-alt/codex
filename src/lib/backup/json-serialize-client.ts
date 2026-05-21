/**
 * Main-thread client for the JSON serialization worker.
 *
 * Lazily spins up a single shared worker (created on first use, reused for
 * the rest of the export). Falls back to inline `JSON.stringify` when
 * Web Workers are unavailable (e.g. some test environments) so callers
 * never have to branch on environment.
 */
import { backupLog } from "@/lib/backup/backup-logger";


type Pending = {
  resolve: (chunk: string) => void;
  reject: (err: Error) => void;
};

let _worker: Worker | null = null;
let _nextId = 1;
const _pending = new Map<number, Pending>();

function ensureWorker(): Worker | null {
  if (_worker) return _worker;
  if (typeof Worker === "undefined") return null;
  try {
    const w = new Worker(
      new URL("../../workers/json-serialize-worker.ts", import.meta.url),
      { type: "module" },
    );
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; chunk?: string; error?: string }>) => {
      const { id, ok, chunk, error } = e.data;
      const p = _pending.get(id);
      if (!p) return;
      _pending.delete(id);
      if (ok && typeof chunk === "string") p.resolve(chunk);
      else p.reject(new Error(error || "json-serialize-worker failed"));
    };
    w.onerror = (ev) => {
      const err = new Error(ev.message || "json-serialize-worker error");
      backupLog.error("worker", "json-serialize-worker fatal", err);
      for (const p of _pending.values()) p.reject(err);
      _pending.clear();
    };
    _worker = w;
    return w;
  } catch {
    return null;
  }
}

/**
 * Serialize an array of rows into a JSON fragment (comma-separated row
 * literals, no surrounding brackets). Off-thread when a worker is
 * available, synchronous fallback otherwise.
 */
export function serializeRowsInWorker(rows: unknown[]): Promise<string> {
  if (rows.length === 0) return Promise.resolve("");
  const w = ensureWorker();
  if (!w) {
    // Sync fallback — still correct, just not off-thread.
    let out = "";
    for (let i = 0; i < rows.length; i++) {
      out += (i === 0 ? "" : ",") + JSON.stringify(rows[i]);
    }
    return Promise.resolve(out);
  }
  const id = _nextId++;
  return new Promise<string>((resolve, reject) => {
    _pending.set(id, { resolve, reject });
    w.postMessage({ id, rows });
  });
}

/** Tear down the shared worker (HMR / tests). */
export function terminateJsonSerializeWorker(): void {
  if (_worker) {
    try { _worker.terminate(); } catch { /* noop */ }
    _worker = null;
  }
  for (const p of _pending.values()) {
    p.reject(new Error("worker terminated"));
  }
  _pending.clear();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => terminateJsonSerializeWorker());
}
