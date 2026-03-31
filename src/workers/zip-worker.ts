/**
 * Web Worker for ZIP compression/decompression.
 * Keeps JSZip processing off the main thread.
 */

import JSZip from "jszip";

self.onmessage = async (e: MessageEvent<{ action: string; filename?: string; data: ArrayBuffer }>) => {
  const { action, filename, data } = e.data;
  try {
    if (action === "compress") {
      const zip = new JSZip();
      zip.file(filename!, data);
      const result = await zip.generateAsync({
        type: "arraybuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 5 },
      });
      (self as unknown as { postMessage(msg: any, transfer: Transferable[]): void }).postMessage({ success: true, result }, [result]);
    } else if (action === "decompress") {
      const zip = await JSZip.loadAsync(data);
      const jsonFile = Object.keys(zip.files).find(
        (n) => n.endsWith(".json") && !n.startsWith("__MACOSX")
      );
      if (!jsonFile) throw new Error("ZIP ne sadrži JSON fajl.");
      const json = await zip.files[jsonFile].async("string");
      self.postMessage({ success: true, result: json });
    } else {
      self.postMessage({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (err: any) {
    self.postMessage({ success: false, error: err?.message || "ZIP operation failed" });
  }
};
