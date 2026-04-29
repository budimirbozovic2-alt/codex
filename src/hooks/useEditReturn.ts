import { useCallback, useMemo } from "react";
import {
  setEditReturn,
  stashEditReturnState,
  consumeEditReturnState,
} from "@/lib/edit-return";
import { useScrollRestore } from "./useScrollRestore";

interface UseEditReturnOptions<S> {
  /**
   * Absolute path EditPage should return the user to.
   * Can be a string (resolved at hook-call time) or a function (resolved
   * lazily inside `stash()` — useful when the path depends on the current
   * route at the moment of the click).
   */
  path: string | (() => string);
  /** Build a UI snapshot at the moment of stash. Omit to skip state stash. */
  buildSnapshot?: () => S;
  /**
   * Extract scrollY from the consumed snapshot. Defaults to reading
   * `(snapshot as { scrollY?: number }).scrollY`.
   */
  getScrollY?: (snapshot: S | null) => number | null | undefined;
}

interface UseEditReturnApi<S> {
  /** Snapshot consumed once on mount (or null if none). */
  initialSnapshot: S | null;
  /** Call before navigating to /edit; stashes path + snapshot. */
  stash: () => void;
}

/**
 * Encapsulates the full edit-return lifecycle:
 *  1. On mount, lazily consume any previously-stashed snapshot.
 *  2. Auto-restore window scroll using the snapshot's `scrollY`.
 *  3. Expose `stash()` to write a fresh snapshot before navigating to /edit.
 *
 * Pair with `useEditReturnTarget()` inside EditPage to read the return path
 * and navigate back after save/cancel.
 */
export function useEditReturn<S = unknown>(
  opts: UseEditReturnOptions<S>,
): UseEditReturnApi<S> {
  const { path, buildSnapshot, getScrollY } = opts;

  // Consume snapshot exactly once. Lazy `useMemo` runs synchronously during
  // first render so initial state hooks can read from it without a flash.
  const initialSnapshot = useMemo<S | null>(
    () => consumeEditReturnState<S>(),
    [],
  );

  const scrollY = getScrollY
    ? getScrollY(initialSnapshot)
    : (initialSnapshot as { scrollY?: number } | null)?.scrollY ?? null;

  useScrollRestore(scrollY);

  const stash = useCallback(() => {
    const resolvedPath = typeof path === "function" ? path() : path;
    setEditReturn({ path: resolvedPath });
    if (buildSnapshot) {
      stashEditReturnState<S>(buildSnapshot());
    }
  }, [path, buildSnapshot]);

  return { initialSnapshot, stash };
}
