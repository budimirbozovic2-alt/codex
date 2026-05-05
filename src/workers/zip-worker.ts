/**
 * Web Worker for ZIP compression/decompression and large-payload JSON parsing.
 *
 * Long-lived: a single instance handles many requests, demuxed by `requestId`.
 * The JSZip module is therefore imported exactly once per worker lifetime.
 */

import JSZip from "jszip";

interface Req {
  requestId: number;
  action: "compress" | "decompress" | "parseJson";
  filename?: string;
  data: ArrayBuffer;
}

const post = (msg: { requestId: number; success: boolean; result?: unknown; error?: string }, transfer?: Transferable[]) => {
  (self as unknown as { postMessage(m: unknown, t?: Transferable[]): void }).postMessage(msg, transfer);
};

self.onmessage = async (e: MessageEvent<Req>) => {
  const { requestId, action, filename, data } = e.data;
  try {
    if (action === "compress") {
      const zip = new JSZip();
      zip.file(filename!, data);
      const result = await zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 5 },
      });
      post({ requestId, success: true, result }, [result]);
    } else if (action === "decompress") {
      const zip = await JSZip.loadAsync(data);
      const jsonFile = Object.keys(zip.files).find(
        (n) => n.endsWith(".json") && !n.startsWith("__MACOSX")
      );
      if (!jsonFile) throw new Error("ZIP ne sadrži JSON fajl.");
      const json = await zip.files[jsonFile].async("string");
      post({ requestId, success: true, result: json });
    } else if (action === "parseJson") {
      // Decode bytes off the main thread, then JSON.parse. Returning the
      // parsed object (structured-cloneable) saves the renderer a second
      // ~payload-sized allocation that string-then-parse would cause.
      const text = new TextDecoder("utf-8").decode(new Uint8Array(data));
      const parsed = JSON.parse(text);
      post({ requestId, success: true, result: parsed });
    } else {
      post({ requestId, success: false, error: `Unknown action: ${action}` });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ZIP operation failed";
    post({ requestId, success: false, error: message });
  }
};
