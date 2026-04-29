import { useEffect } from "react";

interface UseScrollRestoreOptions {
  /** Maximum RAF attempts to wait for the document to grow tall enough. */
  maxAttempts?: number;
  /** Scroll behavior — defaults to "auto" (instant). */
  behavior?: ScrollBehavior;
  /**
   * Optional scroll container. Defaults to `window` (document scroll).
   * Useful for restoring scroll within an inner scroll container.
   */
  element?: HTMLElement | null;
}

/**
 * Restore vertical scroll position once `targetY` becomes a number.
 *
 * Designed for virtualized / async-grown documents where `scrollHeight` only
 * reaches its final value across a few frames after mount. Re-tries up to
 * `maxAttempts` RAF ticks (~130ms @ 60fps by default) until the document is
 * tall enough to honor the saved offset, then stops.
 *
 * Pass `null` / `undefined` to no-op.
 */
export function useScrollRestore(
  targetY: number | null | undefined,
  opts: UseScrollRestoreOptions = {},
): void {
  const { maxAttempts = 8, behavior = "auto", element = null } = opts;

  useEffect(() => {
    if (typeof targetY !== "number") return;
    let cancelled = false;
    let rafId = 0;
    let attempt = 0;

    const tick = () => {
      if (cancelled) return;
      const target = element ?? null;
      const scrollHeight = target ? target.scrollHeight : document.documentElement.scrollHeight;
      const viewport = target ? target.clientHeight : window.innerHeight;
      const maxScroll = Math.max(0, scrollHeight - viewport);
      const top = Math.min(targetY, maxScroll);

      if (target) {
        target.scrollTo({ top, behavior });
      } else {
        window.scrollTo({ top, behavior });
      }

      attempt += 1;
      if (attempt < maxAttempts && maxScroll < targetY) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [targetY, maxAttempts, behavior, element]);
}
