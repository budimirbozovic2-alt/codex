/**
 * Centralized ZIP compression/decompression service.
 *
 * Performance contract:
 *  - Reuses a single long-lived Web Worker across all imports/exports so
 *    JSZip is loaded exactly once per worker lifetime (instead of once per
 *    operation). Requests are demuxed by `requestId`.
 *  - Falls back to main-thread JSZip if Workers aren't supported. The
 *    fallback `import("jszip")` is promise-cached so concurrent callers
 *    share a single in-flight module load.
 *  - Worker is torn down after `IDLE_TEARDOWN_MS` of inactivity to release
 *    the thread; the next call lazily respawns it.
 */

const WORKER_TIMEOUT = 60_000;
const IDLE_TEARDOWN_MS = 5 * 60_000; // 5 min idle → release worker

type WorkerResponse = { requestId: number; success: boolean; result?: unknown; error?: string };

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

let _worker: Worker | null = null;
let _workerInitFailed = false;
let _nextRequestId = 1;
const _pending = new Map<number, PendingEntry>();
let _idleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleTeardown(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  if (_pending.size > 0) return;
  _idleTimer = setTimeout(() => {
    if (_pending.size === 0 && _worker) {
      _worker.terminate();
      _worker = null;
    }
    _idleTimer = null;
  }, IDLE_TEARDOWN_MS);
}

function rejectAllPending(err: Error): void {
  for (const entry of _pending.values()) {
    clearTimeout(entry.timeout);
    entry.reject(err);
  }
  _pending.clear();
}

function getOrCreateWorker(): Worker | null {
  if (_workerInitFailed) return null;
  if (_worker) return _worker;
  try {
    const w = new Worker(
      new URL("../workers/zip-worker.ts", import.meta.url),
      { type: "module" }
    );
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { requestId, success, result, error } = e.data;
      const entry = _pending.get(requestId);
      if (!entry) return;
      _pending.delete(requestId);
      clearTimeout(entry.timeout);
      if (success) entry.resolve(result);
      else entry.reject(new Error(error || "ZIP operation failed"));
      scheduleIdleTeardown();
    };
    w.onerror = () => {
      // Fatal worker failure — fail every in-flight request and tear down.
      const err = new Error("ZIP worker error");
      rejectAllPending(err);
      try { w.terminate(); } catch { /* noop */ }
      if (_worker === w) _worker = null;
    };
    _worker = w;
    return w;
  } catch {
    _workerInitFailed = true;
    return null;
  }
}

function runInWorker(action: string, payload: { filename?: string; data: ArrayBuffer }): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = getOrCreateWorker();
    if (!worker) {
      reject(new Error("Workers not supported"));
      return;
    }
    const requestId = _nextRequestId++;
    const timeout = setTimeout(() => {
      _pending.delete(requestId);
      reject(new Error("ZIP worker timed out"));
      scheduleIdleTeardown();
    }, WORKER_TIMEOUT);

    _pending.set(requestId, { resolve, reject, timeout });

    if (_idleTimer) {
      clearTimeout(_idleTimer);
      _idleTimer = null;
    }

    const transferable: Transferable[] = [];
    if (payload.data instanceof ArrayBuffer) transferable.push(payload.data);

    try {
      worker.postMessage({ requestId, action, ...payload }, transferable);
    } catch (err) {
      _pending.delete(requestId);
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error("postMessage failed"));
    }
  });
}

// ── Fallbacks (main-thread JSZip) ──────────────────────────
// Promise-cache so concurrent callers share one dynamic import.

type JSZipCtor = typeof import("jszip");
let _jszipPromise: Promise<JSZipCtor> | null = null;

function getJSZip(): Promise<JSZipCtor> {
  if (!_jszipPromise) {
    _jszipPromise = import("jszip")
      .then((m) => m.default)
      .catch((err) => {
        // Reset so a future retry can attempt the import again.
        _jszipPromise = null;
        throw err;
      });
  }
  return _jszipPromise;
}

async function fallbackCompress(filename: string, blob: Blob): Promise<Blob> {
  const JSZip = await getJSZip();
  const zip = new JSZip();
  zip.file(filename, blob);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });
}

async function fallbackDecompress(file: Blob): Promise<string> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);
  const jsonFile = Object.keys(zip.files).find((n) => n.endsWith(".json") && !n.startsWith("__MACOSX"));
  if (!jsonFile) throw new Error("ZIP ne sadrži JSON fajl.");
  return zip.files[jsonFile].async("string");
}

// ── Public API (unchanged signatures) ──────────────────────

/** Compress a blob into a ZIP file containing a single entry. */
export async function compressToZip(filename: string, blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  try {
    const result = (await runInWorker("compress", { filename, data: arrayBuffer })) as ArrayBuffer;
    return new Blob([result], { type: "application/zip" });
  } catch {
    return fallbackCompress(filename, blob);
  }
}

/** Extract the first JSON file from a ZIP blob/file. Returns the JSON text. Throws if no JSON found. */
export async function decompressJsonFromZip(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    return (await runInWorker("decompress", { data: arrayBuffer })) as string;
  } catch {
    return fallbackDecompress(file);
  }
}

/** Test/HMR helper — terminates the worker and clears caches. */
export function _resetZipService(): void {
  if (_idleTimer) { clearTimeout(_idleTimer); _idleTimer = null; }
  rejectAllPending(new Error("zip-service reset"));
  if (_worker) { try { _worker.terminate(); } catch { /* noop */ } _worker = null; }
  _workerInitFailed = false;
  _jszipPromise = null;
  _nextRequestId = 1;
}
