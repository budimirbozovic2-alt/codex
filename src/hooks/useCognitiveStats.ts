/**
 * Thin main-thread adapter for cognitive-analytics counts.
 *
 * Snapshots planner/calibration/latency stores and delegates aggregation
 * to the pure module `@/lib/cognitive/aggregators`. Keeps `CognitiveAnalytics.tsx`
 * free of direct storage imports.
 */
import { useMemo } from "react";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { loadPlanner } from "@/domains/planner";
import { loadCalibration, loadLatency } from "@/lib/metacognitive-storage";
import { calcCognitiveCounts, type CognitiveCounts } from "@/lib/cognitive/aggregators";

export function useCognitiveStats(cards: Card[], reviewLog: ReviewLogEntry[]): CognitiveCounts {
  return useMemo(() => {
    const planner = loadPlanner();
    return calcCognitiveCounts(cards, reviewLog, {
      calibration: loadCalibration(),
      latency: loadLatency(),
      examDate: planner.finalGoalDate ?? null,
    });
  }, [cards, reviewLog]);
}
