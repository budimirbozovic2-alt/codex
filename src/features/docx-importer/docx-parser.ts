/**
 * Parse DOCX files using a Web Worker to avoid blocking the UI thread.
 * Falls back to main-thread parsing if Workers aren't available.
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

async function fallbackParse(arrayBuffer: ArrayBuffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — mammoth.browser nema vlastite tipove.
  const mod = await import("mammoth/mammoth.browser");
  const mammoth = (mod as unknown as { default?: { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> } }).default
    ?? (mod as unknown as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> });
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}
