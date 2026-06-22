/**
 * Thin main-thread adapter for cognitive-analytics counts.
 *
 * Snapshots planner/calibration/latency stores and delegates aggregation
 * to the pure module `@/lib/cognitive/aggregators`. Keeps `CognitiveAnalytics.tsx`
 * free of direct storage imports.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { loadPlanner } from "@/domains/planner";
import { loadCalibration, loadLatency } from "@/domains/metacognition/metacognitive-storage";
import { calcCognitiveCounts, type CognitiveCounts } from "@/lib/cognitive/aggregators";
import { queryKeys } from "@/lib/query/keys";

const EMPTY_COUNTS: CognitiveCounts = {
  cards: 0,
  cardsWithErrors: 0,
  activeErrors: 0,
  totalErrors: 0,
  sectionsWithReview: 0,
  totalSections: 0,
  reviewLog: 0,
  subjectCalibration: 0,
  subjectLatency: 0,
  examDate: null,
};

export function useCognitiveStats(cards: Card[], reviewLog: ReviewLogEntry[]): CognitiveCounts {
  const { data: plannerConfig } = useQuery({
    queryKey: queryKeys.planner.config(),
    queryFn: loadPlanner,
    staleTime: 30_000,
  });
  const { data: calibration = [] } = useQuery({
    queryKey: ["metacognition", "calibration"] as const,
    queryFn: loadCalibration,
    staleTime: 30_000,
  });
  const { data: latency = [] } = useQuery({
    queryKey: ["metacognition", "latency"] as const,
    queryFn: loadLatency,
    staleTime: 30_000,
  });

  return useMemo(() => {
    if (!plannerConfig) return EMPTY_COUNTS;
    return calcCognitiveCounts(cards, reviewLog, {
      calibration,
      latency,
      examDate: plannerConfig.finalGoalDate ?? null,
    });
  }, [cards, reviewLog, plannerConfig, calibration, latency]);
}
