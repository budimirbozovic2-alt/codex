/**
 * React hook: returns the live backlink list for a (subject, target) pair.
 * Re-renders only when that specific slot's version bumps.
 */
import { useSyncExternalStore } from "react";
import type { BacklinkEntry } from "./types";
import { backlinkIndex } from "./BacklinkIndex";
import { EMPTY, memoizedSnapshot, pausedRef } from "./snapshot-cache";

export function useBacklinks(
  subjectId: string,
  targetTitle: string,
  excludeArticleId?: string,
  paused = false,
): BacklinkEntry[] {
  const subscribe = (cb: () => void) => backlinkIndex.subscribe(subjectId, targetTitle, cb);
  const getSnapshot = () => {
    if (paused) return pausedRef(subjectId, targetTitle, excludeArticleId);
    return memoizedSnapshot(subjectId, targetTitle, excludeArticleId);
  };
  const getServerSnapshot = () => EMPTY;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
