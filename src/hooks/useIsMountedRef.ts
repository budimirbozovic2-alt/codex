import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Standard mount-guard ref for async callbacks that resolve after unmount.
 *
 * Replaces the ad-hoc `let cancelled = false` / `let isMounted = true` pattern
 * scattered across ~9 hooks. Use inside `useEffect` for fire-and-forget
 * `.then(...)` continuations where there's nothing to cancel — only state
 * writes to suppress.
 *
 * For cancellable async work (fetch, audio decode, long SQLite queries) prefer
 * an `AbortController` instead.
 */
export function useIsMountedRef(): MutableRefObject<boolean> {
  const ref = useRef(true);
  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);
  return ref;
}
