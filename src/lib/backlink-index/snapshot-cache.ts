/**
 * Snapshot caches for `useBacklinks`.
 *
 * - `memoizedSnapshot`: stable array reference per (subject, target, exclude)
 *   while the index version is unchanged — required by `useSyncExternalStore`.
 * - `pausedRef` / `clearPausedBacklinks`: freeze the last snapshot while the
 *   editor is open, so typing doesn't churn the panel.
 */
import type { BacklinkEntry } from "./types";
import { norm } from "./normalize";
import { backlinkIndex } from "./BacklinkIndex";

export const EMPTY: BacklinkEntry[] = [];

const snapshotCache = new Map<string, { v: number; data: BacklinkEntry[] }>();

export function memoizedSnapshot(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
): BacklinkEntry[] {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}`;
  const v = backlinkIndex.getVersion(subjectId, targetTitle);
  const cached = snapshotCache.get(key);
  if (cached && cached.v === v) return cached.data;
  const data = backlinkIndex.getBacklinks(subjectId, targetTitle, excludeArticleId);
  snapshotCache.set(key, { v, data });
  return data;
}

// When `paused`, freeze the last known snapshot so editing doesn't trigger
// recomputation. The cached snapshot stays valid until pause is lifted.
const pausedCache = new Map<string, BacklinkEntry[]>();

export function pausedRef(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
): BacklinkEntry[] {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}::paused`;
  let v = pausedCache.get(key);
  if (!v) {
    v = memoizedSnapshot(subjectId, targetTitle, excludeArticleId);
    pausedCache.set(key, v);
  }
  return v;
}

/** Clear the paused snapshot for this slot (call when leaving edit mode). */
export function clearPausedBacklinks(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
): void {
  const key = `${subjectId}::${norm(targetTitle)}::${excludeArticleId ?? ""}::paused`;
  pausedCache.delete(key);
}
