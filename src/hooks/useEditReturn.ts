import { useCallback, useMemo } from "react";
import {
  setEditReturn,
  stashEditReturnState,
  consumeEditReturnState,
  type BaseEditReturnSnapshot,
} from "@/lib/edit-return";
import { useScrollRestore } from "./useScrollRestore";

interface UseEditReturnOptions<S extends BaseEditReturnSnapshot> {
  /**
   * Absolute path EditPage should return the user to.
   * String → resolved at hook-call time.
   * Function → resolved lazily inside `stash()` (use when path depends on the
   * route at the moment of the click).
   */
  path: string | (() => string);
  /**
   * Expected categoryId on consume. If the stashed snapshot's categoryId
   * doesn't match, the snapshot is discarded (no cross-category leakage).
   */
  categoryId?: string;
  /**
   * Resolved lazily inside `stash()` so the hook always records the most
   * recent edit target without re-binding the callback.
   */
  cardId?: () => string | null | undefined;
  /**
   * View-specific snapshot fields. The hook automatically adds `path`,
   * `scrollY`, `categoryId` and `cardId` — consumers only provide extras.
   */
  buildExtras?: () => Omit<S, keyof BaseEditReturnSnapshot>;
}

interface UseEditReturnApi<S> {
  /** Snapshot consumed once on mount (or null if missing / failed validation). */
  initialSnapshot: S | null;
  /** Call before navigating to /edit; stashes path + standardized snapshot. */
  stash: () => void;
}

/** Resolve current absolute path (pathname + search) — used both at stash and at consume. */
function currentAbsolutePath(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname + window.location.search;
}

/**
 * Encapsulates the full edit-return lifecycle with a uniform contract:
 *  1. On mount, lazily consume any previously-stashed snapshot, validating
 *     `path` (and `categoryId` when provided).
 *  2. Auto-restore window scroll using the snapshot's `scrollY`.
 *  3. Expose `stash()` to write a fresh snapshot before navigating to /edit.
 *
 * Pair with `useEditReturnTarget()` inside EditPage to read the return path
 * and navigate back after save/cancel.
 */
export function useEditReturn<S extends BaseEditReturnSnapshot = BaseEditReturnSnapshot>(
  opts: UseEditReturnOptions<S>,
): UseEditReturnApi<S> {
  const { path, categoryId, cardId, buildExtras } = opts;

  // Consume snapshot exactly once. Lazy `useMemo` runs synchronously during
  // first render so initial state hooks can read from it without a flash.
  const initialSnapshot = useMemo<S | null>(() => {
    const here = currentAbsolutePath();
    return consumeEditReturnState<S>((snap) => {
      if (!snap || typeof snap !== "object") return false;
      // Path must match exactly — guards against stale snapshots leaking
      // into a different route after navigation.
      if (typeof snap.path !== "string" || snap.path !== here) return false;
      // CategoryId, when both sides specify it, must match — prevents a
      // snapshot stashed in subject A from being applied in subject B.
      if (categoryId != null && snap.categoryId != null && snap.categoryId !== categoryId) {
        return false;
      }
      return true;
    });
  }, [categoryId]);

  useScrollRestore(initialSnapshot?.scrollY ?? null);

  const stash = useCallback(() => {
    const resolvedPath = typeof path === "function" ? path() : path;
    setEditReturn({ path: resolvedPath });

    const extras = buildExtras ? buildExtras() : undefined;
    const snapshot = {
      ...(extras as object | undefined),
      path: resolvedPath,
      scrollY: typeof window !== "undefined" ? window.scrollY : undefined,
      categoryId,
      cardId: cardId?.() ?? undefined,
    } as S;

    stashEditReturnState<S>(snapshot);
  }, [path, categoryId, cardId, buildExtras]);

  return { initialSnapshot, stash };
}
