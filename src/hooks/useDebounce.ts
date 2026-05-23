import { useState, useEffect } from "react";
import { taskScheduler } from "@/lib/scheduler";

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handle = taskScheduler.setTimeout(
      () => setDebouncedValue(value),
      delay,
      { label: "useDebounce", priority: "normal" },
    );
    return () => taskScheduler.cancel(handle);
  }, [value, delay]);

  return debouncedValue;
}
