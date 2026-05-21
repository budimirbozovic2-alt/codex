import { db, MindMapDoc } from "./db";

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
  const all = await db.mindMaps.orderBy("updatedAt").reverse().toArray();
  _cache = all;
  return all;
}

export async function saveMindMap(doc: MindMapDoc): Promise<void> {
  // V6: only invalidate + notify AFTER a confirmed write. Otherwise a failed
  // put would invalidate the cache, force a reload from stale IDB, and drop
  // the user's drawing.
  try {
    await db.mindMaps.put(doc);
  } catch (err) {
    logger.error("[mindmap-storage] saveMindMap failed", err);
    throw err;
  }
  _cache = null;
  _notify();
}

export async function deleteMindMap(id: string): Promise<void> {
  _cache = null;
  await db.mindMaps.delete(id);
  _notify();
}

export async function getMindMap(id: string): Promise<MindMapDoc | undefined> {
  // Hit cache when available to avoid IDB roundtrip from many EmbeddedMindMap nodes.
  if (_cache) {
    const hit = _cache.find(d => d.id === id);
    if (hit) return hit;
  }
  return db.mindMaps.get(id);
}

// V12: HMR cleanup — prevent leaking Set-level listeners across module reloads.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _listeners.clear();
    _cache = null;
  });
}
