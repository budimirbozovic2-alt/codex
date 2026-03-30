/**
 * Centralized ZIP compression/decompression service.
 * Lazy-loads jszip to keep the main bundle small.
 */

let _JSZip: any = null;

async function getJSZip() {
  if (!_JSZip) {
    _JSZip = (await import("jszip")).default;
  }
  return _JSZip;
}

/** Compress a blob into a ZIP file containing a single entry. */
export async function compressToZip(filename: string, blob: Blob): Promise<Blob> {
  const JSZip = await getJSZip();
  const zip = new JSZip();
  zip.file(filename, blob);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 5 } });
}

/** Extract the first JSON file from a ZIP blob/file. Returns the JSON text. Throws if no JSON found. */
export async function decompressJsonFromZip(file: Blob): Promise<string> {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(file);
  const jsonFile = Object.keys(zip.files).find((n) => n.endsWith(".json") && !n.startsWith("__MACOSX"));
  if (!jsonFile) throw new Error("ZIP ne sadrži JSON fajl.");
  return zip.files[jsonFile].async("string");
}
