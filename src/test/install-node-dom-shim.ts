import { JSDOM } from "jsdom";

/**
 * TipTap `generateJSON`, DOMPurify, and test factories call DOM APIs. Node env
 * skips vitest's jsdom bootstrap; seed a minimal document once per worker.
 *
 * Node 24+ may expose a partial `window` without TreeWalker/NodeFilter — treat
 * that as "no DOM" and install a full JSDOM surface.
 */
function needsDomShim(): boolean {
  if (typeof document === "undefined") return true;
  if (typeof document.createTreeWalker !== "function") return true;
  if (typeof globalThis.NodeFilter === "undefined") return true;
  if (typeof window === "undefined") return true;
  if (typeof window.document === "undefined") return true;
  return false;
}

export function installNodeDomShim(): void {
  if (!needsDomShim()) {
    return;
  }

  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost/",
  });
  const w = dom.window;

  const globals = {
    window: w,
    document: w.document,
    navigator: w.navigator,
    HTMLElement: w.HTMLElement,
    Node: w.Node,
    Text: w.Text,
    NodeFilter: w.NodeFilter,
    DOMParser: w.DOMParser,
    getComputedStyle: w.getComputedStyle.bind(w),
    requestAnimationFrame: (cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
  } as const;

  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  }
}
