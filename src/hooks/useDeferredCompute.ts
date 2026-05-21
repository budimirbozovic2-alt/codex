import { useState, useEffect, useRef } from "react";

import { logger } from "@/lib/logger";
/**
 * Defers a heavy computation to requestIdleCallback (or setTimeout fallback).
 * Returns `null` until the computation is complete, then returns the result.
 * Re-runs when `deps` change.
 */
export function useDeferredCompute<T>(compute: () => T | Promise<T>, deps: unknown[]): Awaited<T> | null {
  const [result, setResult] = useState<Awaited<T> | null>(null);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const val = computeRef.current();
      if (val instanceof Promise) {
        val.then((resolved) => { if (!cancelled) setResult(resolved as Awaited<T>); })
           .catch((err) => { logger.warn("[useDeferredCompute] async error", err); });
      } else {
        setResult(val as Awaited<T>);
      }
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
