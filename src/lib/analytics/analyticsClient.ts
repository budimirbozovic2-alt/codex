/**
 * Main-thread analytics client (TD-ARCH-9).
 *
 * Runs `_pure` aggregations on the main thread, deferred via
 * `useDeferredCompute` / `LazyChart` so the UI stays responsive.
 * The analytics Web Worker was removed — structured-clone overhead and
 * duplicated `_pure` modules outweighed gains at ≤20k cards.
 */
import {
  loadCalibration,
  loadLatency,
} from "@/domains/metacognition/metacognitive-storage";
import {
  loadDisciplineLog,
  loadPlanner,
} from "@/domains/planner";
import { calcInterferencePairs } from "./_pure/interference";
import {
  calcCategoryStability,
  calcStrategicRealityCheck,
} from "./_pure/stability";
import {
  calcStressPerformance,
  calcFrictionAnalysis,
} from "./_pure/friction";
import { calcBlindSpots } from "./_pure/blind-spots";
import { calcRecoveryRate } from "./_pure/recovery";
import { calcResistance } from "./_pure/resistance";
import { buildChartBundle } from "./_pure/charts";
import type { Card } from "@/lib/sr/types";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { ResistanceWeights } from "./_pure/resistance";

export const analyticsClient = {
  buildCharts(
    cards: Card[],
    reviewLog: ReviewLogEntry[],
    targetReviewPct: number,
  ) {
    return buildChartBundle(cards, reviewLog, targetReviewPct);
  },

  runInterference(cards: Card[], limit = 10) {
    return calcInterferencePairs(cards, limit);
  },

  runCategoryStability(
    cards: Card[],
    categories: string[],
    examDateStr: string | null,
  ) {
    return calcCategoryStability(cards, categories, examDateStr);
  },

  runStrategicRealityCheck(cards: Card[], reviewLog: ReviewLogEntry[]) {
    return calcStrategicRealityCheck(
      cards,
      reviewLog,
      loadDisciplineLog(),
      loadPlanner(),
    );
  },

  runStressPerformance(reviewLog: ReviewLogEntry[]) {
    return calcStressPerformance(reviewLog, loadLatency());
  },

  runFrictionAnalysis(reviewLog: ReviewLogEntry[], limit = 10) {
    return calcFrictionAnalysis(reviewLog, limit);
  },

  runBlindSpots(cards: Card[]) {
    return calcBlindSpots(cards, loadCalibration());
  },

  runRecovery() {
    return calcRecoveryRate(loadDisciplineLog());
  },

  runResistance(
    cards: Card[],
    categories: string[],
    reviewLog: ReviewLogEntry[],
    weightsByCategory: Record<string, ResistanceWeights>,
    fallbackWeights: ResistanceWeights,
  ) {
    return calcResistance(
      cards,
      categories,
      reviewLog,
      loadLatency(),
      weightsByCategory,
      fallbackWeights,
    );
  },
};

/** @deprecated TD-ARCH-9 — worker removed; kept for test teardown compatibility. */
export function __terminateAnalyticsWorker(): void {
  /* noop */
}
