/**
 * Mind maps SSOT façade — A1b P1.2.
 *
 * Data plane delegates to `@/lib/db/queries/mind-maps` (SQLite-primary,
 * Dexie mirror). This module preserves the in-memory cache + listener
 * subscription contract so 40+ consumers (and `useMindMaps`) keep working
 * without import churn.
 */
import type { MindMapDoc } from "./db";
import * as repo from "./db/queries/mind-maps";
import { logger } from "@/lib/logger";

// ── In-memory cache (parnjak sources-storage.ts) ──
let _cache: MindMapDoc[] | null = null;

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

/** Invalidate the in-memory mind maps cache (call after external mutations like import/restore). */
export function invalidateMindMapsCache(): void {
  _cache = null;
  _notify();
}

export async function loadMindMaps(): Promise<MindMapDoc[]> {
  if (_cache) return _cache;
  const all = await repo.listAllMindMaps();
  _cache = all;
  return all;
}

export async function saveMindMap(doc: MindMapDoc): Promise<void> {
  try {
    await repo.putMindMap(doc);
  } catch (err) {
    logger.error("[mindmap-storage] saveMindMap failed", err);
    throw err;
  }
  _cache = null;
  _notify();
}

export async function deleteMindMap(id: string): Promise<void> {
  _cache = null;
  await repo.deleteMindMap(id);
  _notify();
}

export async function getMindMap(id: string): Promise<MindMapDoc | undefined> {
  if (_cache) {
    const hit = _cache.find(d => d.id === id);
    if (hit) return hit;
  }
  return repo.getMindMap(id);
}

// V12: HMR cleanup — prevent leaking Set-level listeners across module reloads.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _listeners.clear();
    _cache = null;
  });
}
