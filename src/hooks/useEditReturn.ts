import { useCallback, useMemo } from "react";
import {
  setEditReturn,
  stashEditReturnState,
  consumeEditReturnState,
  type BaseEditReturnSnapshot,
} from "@/lib/edit-return";
import { getCurrentEditingCardId } from "@/contexts/ui/UIProvider";
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
   * Card id to record in the snapshot. Accepts either a direct value (read at
   * stash time from the latest render) or a getter (resolved lazily). Using a
   * direct value from a SSOT (e.g. `editingCardId` from `useUIContext`) avoids
   * stale-ref bugs when components keep their own copy. (M3)
   */
  cardId?: string | null | (() => string | null | undefined);
  /**
   * View-specific snapshot fields. The hook automatically adds `path`,
   * `scrollY`, `categoryId` and `cardId` — consumers only provide extras.
   */
  buildExtras?: () => Omit<S, keyof BaseEditReturnSnapshot>;
}

interface UseEditReturnApi<S> {
  /** Snapshot consumed once on mount (or null if missing / failed validation). */
  initialSnapshot: S | null;
  /**
   * Call before navigating to /edit; stashes path + standardized snapshot.
   * Pass `cardIdOverride` to record an explicit id (preferred — avoids relying
   * on render timing or SSOT mirror state). When omitted, falls back to
   * `opts.cardId`, then to the synchronous SSOT mirror (`getCurrentEditingCardId`).
   */
  stash: (cardIdOverride?: string | null) => void;
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

  // Stabilize the cardId resolver so `useCallback(stash)` keeps a stable
  // identity even when consumers pass an inline value/getter literal each render.
  const cardIdResolver = useMemo<() => string | null | undefined>(
    () => (typeof cardId === "function" ? cardId : () => cardId ?? undefined),
    [cardId],
  );

  const stash = useCallback((cardIdOverride?: string | null) => {
    const resolvedPath = typeof path === "function" ? path() : path;
    setEditReturn({ path: resolvedPath });

    const extras = buildExtras ? buildExtras() : undefined;
    // Resolution order (highest → lowest):
    //   1. explicit `cardIdOverride` argument (preferred)
    //   2. `opts.cardId` (value or getter)
    //   3. SSOT mirror in `UIProvider` (`getCurrentEditingCardId`)
    let resolvedCardId: string | null | undefined;
    if (cardIdOverride !== undefined) {
      resolvedCardId = cardIdOverride;
    } else {
      const fromOpts = cardIdResolver();
      resolvedCardId = fromOpts !== undefined ? fromOpts : getCurrentEditingCardId();
    }
    const snapshot = {
      ...(extras as object | undefined),
      path: resolvedPath,
      scrollY: typeof window !== "undefined" ? window.scrollY : undefined,
      categoryId,
      cardId: resolvedCardId ?? undefined,
    } as S;

    stashEditReturnState<S>(snapshot);
  }, [path, categoryId, cardIdResolver, buildExtras]);

  return { initialSnapshot, stash };
}
