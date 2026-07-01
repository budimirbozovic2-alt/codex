import { useCallback } from "react";
import {
  addLatencyEntry,
  type LatencyEntry,
} from "@/domains/metacognition/metacognitive-storage";

/**
 * Records answer-reveal latency. Wraps the metacognitive-storage write so UI
 * components don't import the domain storage directly (architecture guard).
 */
export function useLatencyTracker() {
  const recordLatency = useCallback((entry: LatencyEntry) => {
    addLatencyEntry(entry);
  }, []);
  return { recordLatency };
}
