/**
 * Generic deps-keyed worker query hook.
 *
 * Returns `null` while the worker computes. Cancels stale results when
 * dependencies change so an older long-running call cannot overwrite a
 * newer one.
 */
import { useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

export function useAnalyticsWorker<T>(
  task: () => Promise<T>,
  deps: unknown[],
): T | null {
  const [data, setData] = useState<T | null>(null);
  const taskRef = useRef(task);
  taskRef.current = task;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    taskRef.current()
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err) => { logger.warn("[useAnalyticsWorker] task failed", err); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
