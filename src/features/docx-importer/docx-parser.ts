/**
 * Parse DOCX files using a Web Worker to avoid blocking the UI thread.
 * This is a desktop-only app — Workers are always available in Electron.
 * The error path re-throws so the caller can surface it to the user.
 */

export function parseDocxInWorker(arrayBuffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: ((v: string) => void) | ((reason: unknown) => void), val: unknown) => {
      if (settled) return;
      settled = true;
      (fn as (v: unknown) => void)(val);
    };

    try {
      const worker = new Worker(
        new URL("./docx-worker.ts", import.meta.url),
        { type: "module" }
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        settle(reject, new Error("DOCX parsing timed out"));
      }, 30_000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        worker.terminate();
        if (e.data.success) {
          settle(resolve, e.data.html);
        } else {
          settle(reject, new Error(e.data.error));
        }
      };

      worker.onerror = () => {
        clearTimeout(timeout);
        worker.terminate();
        // Fallback to main thread
        fallbackParse(arrayBuffer).then(
          (html) => settle(resolve, html),
          (err) => settle(reject, err),
        );
      };

      // Transfer the buffer (zero-copy) — caller no longer needs it after
      // posting. The previous `arrayBuffer.slice(0)` allocated a copy AND
      // transferred only the copy, leaving the worker with a buffer the
      // main thread still owned (read failures on large files).
      worker.postMessage({ arrayBuffer }, [arrayBuffer]);
    } catch {
      // Workers not supported — fallback
      fallbackParse(arrayBuffer).then(
        (html) => settle(resolve, html),
        (err) => settle(reject, err),
      );
    }
  });
}

// Fallback is intentionally a hard error: mammoth is only bundled inside
// docx-worker.ts (off the main thread). Importing it here would double the
// bundle size (~490 KB). In Electron, Workers always work; if the Worker
// fails for an unexpected reason, the user is shown an error and can retry.
async function fallbackParse(_arrayBuffer: ArrayBuffer): Promise<string> {
  throw new Error("DOCX Worker nije uspio. Pokušajte ponovo ili provjerite fajl.");
}
