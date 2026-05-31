/**
 * Mind maps SSOT façade — A1c-2.
 *
 * Data plane delegates to `@/lib/db/queries/mind-maps` (SQLite-only).
 * The in-memory façade cache was removed; TanStack Query is now the single
 * read cache. Listener API (`onMindMapsChanged`) remains as the bridge
 * between writers and the TanStack query bridge.
 */
import type { MindMapDoc } from "./db-types";
import * as repo from "./db/queries/mind-maps";
import { logger } from "@/lib/logger";
import { wrapWrite, type WriteResult } from "@/lib/persistence/write-result";

// ── Listener-based invalidation signaling ──
type MindMapListener = () => void;
const _listeners = new Set<MindMapListener>();

/** Subscribe to mind map changes. Returns unsubscribe function. */
export function onMindMapsChanged(fn: MindMapListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function _notify(): void {
  _listeners.forEach(fn => {
    try { fn(); } catch { /* swallow */ }
  });
}

/** Notify downstream caches (TanStack bridge listens here). */
export function invalidateMindMapsCache(): void {
  _notify();
}

export async function loadMindMaps(): Promise<MindMapDoc[]> {
  return repo.listAllMindMaps();
}

export async function saveMindMap(doc: MindMapDoc): Promise<void> {
  try {
    await repo.putMindMap(doc);
  } catch (err) {
    logger.error("[mindmap-storage] saveMindMap failed", err);
    throw err;
  }
  _notify();
}

export async function deleteMindMap(id: string): Promise<void> {
  await repo.deleteMindMap(id);
  _notify();
}

export async function getMindMap(id: string): Promise<MindMapDoc | undefined> {
  return repo.getMindMap(id);
}

// V12: HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _listeners.clear();
  });
}
