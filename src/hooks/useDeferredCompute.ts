import { useState, useEffect, useRef } from "react";

import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";
/**
 * Defers a heavy computation to the task scheduler's idle slot (rIC under the
 * hood with a setTimeout fallback). Returns `null` until the computation is
 * complete, then returns the result. Re-runs when `deps` change.
 */
export function useDeferredCompute<T>(compute: () => T | Promise<T>, deps: unknown[]): Awaited<T> | null {
  const [result, setResult] = useState<Awaited<T> | null>(null);
  const computeRef = useRef(compute);
  computeRef.current = compute;

  useEffect(() => {
    let cancelled = false;
    const handle = taskScheduler.idle(() => {
      if (cancelled) return;
      const val = computeRef.current();
      if (val instanceof Promise) {
        val.then((resolved) => { if (!cancelled) setResult(resolved as Awaited<T>); })
           .catch((err) => { logger.warn("[useDeferredCompute] async error", err); });
      } else {
        setResult(val as Awaited<T>);
      }
    }, { label: "useDeferredCompute", priority: "idle", timeoutMs: 2000, fallbackMs: 50 });

    return () => {
      cancelled = true;
      taskScheduler.cancel(handle);
    };
    // Reason: `deps` is the explicit caller-supplied dep list; the compute fn is
    // captured via closure on purpose so each recompute uses the latest inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return result;
}
