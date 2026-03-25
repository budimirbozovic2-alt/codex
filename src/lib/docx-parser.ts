/**
 * Parse DOCX files using a Web Worker to avoid blocking the UI thread.
 * Falls back to main-thread parsing if Workers aren't available.
 */

export function parseDocxInWorker(arrayBuffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: typeof resolve | typeof reject, val: any) => {
      if (settled) return;
      settled = true;
      fn(val);
    };

    try {
      const worker = new Worker(
        new URL("../workers/docx-worker.ts", import.meta.url),
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

      worker.postMessage({ arrayBuffer }, [arrayBuffer.slice(0)]);
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
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}
