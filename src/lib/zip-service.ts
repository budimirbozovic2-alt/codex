/**
 * Centralized ZIP compression/decompression service.
 * Uses a Web Worker to keep the main thread responsive.
 * Falls back to main-thread JSZip if Workers aren't available.
 */

const WORKER_TIMEOUT = 60_000;

function runInWorker(action: string, payload: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: typeof resolve | typeof reject, val: any) => {
      if (settled) return;
      settled = true;
      fn(val);
    };

    try {
      const worker = new Worker(
        new URL("../workers/zip-worker.ts", import.meta.url),
        { type: "module" }
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        settle(reject, new Error("ZIP worker timed out"));
      }, WORKER_TIMEOUT);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        if (e.data.success) {
          settle(resolve, e.data.result);
        } else {
          settle(reject, new Error(e.data.error));
        }
      };

      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        settle(reject, new Error("ZIP worker error"));
      };

      // Transfer ArrayBuffer ownership for zero-copy
      const transferable: Transferable[] = [];
      if (payload.data instanceof ArrayBuffer) {
        transferable.push(payload.data);
      }
      worker.postMessage({ action, ...payload }, transferable);
    } catch {
      settle(reject, new Error("Workers not supported"));
    }
  });
}

// ── Fallbacks (main-thread JSZip) ──────────────────────────

let _JSZip: any = null;

async function getJSZip() {
  if (!_JSZip) {
    _JSZip = (await import("jszip")).default;
  }
  return _JSZip;
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
    const result = await runInWorker("compress", { filename, data: arrayBuffer });
    return new Blob([result], { type: "application/zip" });
  } catch {
    return fallbackCompress(filename, blob);
  }
}

/** Extract the first JSON file from a ZIP blob/file. Returns the JSON text. Throws if no JSON found. */
export async function decompressJsonFromZip(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    return await runInWorker("decompress", { data: arrayBuffer });
  } catch {
    return fallbackDecompress(file);
  }
}
