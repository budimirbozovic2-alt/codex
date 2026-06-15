import { getBootState } from "@/lib/boot";
import { seedReaderFixture } from "./seed-reader-fixture";

const autosaveFlushers = new Set<() => void>();

export function registerE2EAutosaveFlush(fn: () => void): () => void {
  autosaveFlushers.add(fn);
  return () => {
    autosaveFlushers.delete(fn);
  };
}

function flushSourceAutosave(): void {
  for (const fn of autosaveFlushers) {
    try {
      fn();
    } catch {
      /* E2E flush is best-effort */
    }
  }
}

export interface CodexE2EBridge {
  waitForReady: (timeoutMs?: number) => Promise<void>;
  seedReaderFixture: () => Promise<{ categoryId: string; sourceId: string; skriptaSourceId: string }>;
  flushSourceAutosave: () => void;
}

declare global {
  interface Window {
    __codexE2E?: CodexE2EBridge;
  }
}

async function waitForReady(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (getBootState().type === "ready") return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Boot did not reach ready within ${timeoutMs}ms`);
}

/** Expose deterministic DB seed + boot helpers for Playwright. */
export function installE2EBridge(): void {
  window.__codexE2E = {
    waitForReady,
    seedReaderFixture,
    flushSourceAutosave,
  };
}
