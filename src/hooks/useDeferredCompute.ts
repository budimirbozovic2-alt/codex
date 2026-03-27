import { useState, useEffect, useRef } from "react";

/**
 * Defers a heavy computation to requestIdleCallback (or setTimeout fallback).
 * Returns `null` until the computation is complete, then returns the result.
 * Re-runs when `deps` change.
 */
export function useDeferredCompute<T>(compute: () => T, deps: unknown[]): T | null {
  const [result, setResult] = useState<T | null>(null);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      setResult(computeRef.current());
    };

    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(run, { timeout: 2000 });
      return () => { cancelled = true; window.cancelIdleCallback(id); };
    } else {
      const id = setTimeout(run, 50);
      return () => { cancelled = true; clearTimeout(id); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return result;
}
