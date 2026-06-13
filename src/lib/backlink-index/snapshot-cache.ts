/**
 * Snapshot caches for `useBacklinks`.
 *
 * - `memoizedSnapshot`: stable array reference per (subject, target, exclude)
 *   while the index version is unchanged — required by `useSyncExternalStore`.
 * - `pausedRef`: freeze the last snapshot while the
 *   editor is open, so typing doesn't churn the panel.
 *
 * Both caches are bounded LRU (500 entries) — without a cap they grow
 * unbounded for the lifetime of the page (D.3 in Deep Audit v2).
 */
import type { BacklinkEntry } from "./types";
import { norm } from "./normalize";
import { backlinkIndex } from "./BacklinkIndex";

export const EMPTY: BacklinkEntry[] = [];

const MAX_CACHE = 500;

function lruSet<K, V>(map: Map<K, V>, key: K, val: V): void {
  if (map.has(key)) map.delete(key);
  map.set(key, val);
  if (map.size > MAX_CACHE) {
    const first = map.keys().next();
    if (!first.done) map.delete(first.value);
  }
}

function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  const v = map.get(key);
  if (v !== undefined) {
    // Touch LRU order.
    map.delete(key);
    map.set(key, v);
  }
  return v;
}

const snapshotCache = new Map<string, { v: number; data: BacklinkEntry[] }>();

export function memoizedSnapshot(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
): BacklinkEntry[] {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}`;
  const v = backlinkIndex.getVersion(subjectId, targetTitle);
  const cached = lruGet(snapshotCache, key);
  if (cached && cached.v === v) return cached.data;
  const data = backlinkIndex.getBacklinks(subjectId, targetTitle, excludeArticleId);
  lruSet(snapshotCache, key, { v, data });
  return data;
}

const pausedCache = new Map<string, BacklinkEntry[]>();

export function pausedRef(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
): BacklinkEntry[] {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}::paused`;
  let v = lruGet(pausedCache, key);
  if (!v) {
    v = memoizedSnapshot(subjectId, targetTitle, excludeArticleId);
    lruSet(pausedCache, key, v);
  }
  return v;
}
