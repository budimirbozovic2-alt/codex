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

interface MammothResult { value: string; messages: unknown[] }
interface MammothApi {
  convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
const m = mammoth as unknown as MammothApi;

self.onmessage = async (e: MessageEvent<{ arrayBuffer: ArrayBuffer }>) => {
  try {
    const result = await m.convertToHtml({ arrayBuffer: e.data.arrayBuffer });
    self.postMessage({ success: true, html: result.value, messages: result.messages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "DOCX parsing failed";
    self.postMessage({ success: false, error: message });
  }
};
