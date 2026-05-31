/**
 * Web Worker for DOCX parsing.
 * Keeps mammoth.js processing off the main thread.
 *
 * Koristimo `mammoth/mammoth.browser` umjesto generičkog `mammoth` jer
 * generički entry u nekim bundlerima dovodi do "uncompressed data size
 * mismatch" greške u browser/worker okruženju (vidi mammoth.js#419).
 * Browser entry ima sve zavisnosti inline i ne pokušava da koristi node-only
 * JSZip path.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — mammoth.browser nema vlastite tipove.
import mammoth from "mammoth/mammoth.browser";

interface MammothMessage { type?: string; message?: string }
interface MammothResult { value: string; messages: MammothMessage[] }
interface MammothApi {
  convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
const m = mammoth as unknown as MammothApi;

self.onmessage = async (e: MessageEvent<{ arrayBuffer: ArrayBuffer }>) => {
  try {
    const result = await m.convertToHtml({ arrayBuffer: e.data.arrayBuffer });
    // Surface mammoth warnings/errors so the host can log them (Wave 5).
    const warnings = (result.messages || [])
      .filter((msg) => msg && (msg.type === "warning" || msg.type === "error"))
      .map((msg) => `${msg.type}: ${msg.message ?? ""}`);
    self.postMessage({ success: true, html: result.value, warnings });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DOCX parsing failed";
    self.postMessage({ success: false, error: message });
  }
};

// Last-resort handler for synchronous throws inside the worker itself
// (e.g. mammoth module-eval failures). Without this the host sees only the
// generic `worker.onerror` with no detail.
self.onerror = (event) => {
  const message = typeof event === "string"
    ? event
    : (event as ErrorEvent).message ?? "DOCX worker crashed";
  try { self.postMessage({ success: false, error: message }); } catch { /* gone */ }
};
