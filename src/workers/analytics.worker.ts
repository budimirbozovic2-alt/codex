/**
 * Analytics worker — runs OLAP-style aggregations off the main thread.
 *
 * All callees live under `src/lib/analytics/_pure/**` and have ZERO
 * dependencies on storage, IDB, React, or DOM. The main thread snapshots
 * any localStorage-backed data (calibration, latency, discipline log,
 * planner config) and passes it as part of the request payload.
 *
 * Long-lived: a single instance handles many requests, multiplexed by
 * Comlink. Lazy-instantiated on first call by `workerClient.ts`.
 */
import * as Comlink from "comlink";
import type { Card } from "../lib/spaced-repetition";
import type { ReviewLogEntry } from "../lib/storage";
import { calcInterferencePairs } from "../lib/analytics/_pure/interference";
import {
  calcCategoryStability,
  calcStrategicRealityCheck,
} from "../lib/analytics/_pure/stability";
import {
  calcStressPerformance,
  calcFrictionAnalysis,
} from "../lib/analytics/_pure/friction";
import { calcBlindSpots } from "../lib/analytics/_pure/blind-spots";
import { calcRecoveryRate } from "../lib/analytics/_pure/recovery";
import { calcResistance, type ResistanceWeights } from "../lib/analytics/_pure/resistance";
import { buildChartBundle, type ChartBundle } from "../lib/analytics/_pure/charts";
import type { AnalyticsSnapshots } from "../lib/analytics/_pure/types";

const api = {
  runInterference(cards: Card[], limit = 10) {
    return calcInterferencePairs(cards, limit);
  },
  runCategoryStability(cards: Card[], categories: string[], examDateStr: string | null) {
    return calcCategoryStability(cards, categories, examDateStr);
  },
  runStrategicRealityCheck(
    cards: Card[],
    reviewLog: ReviewLogEntry[],
    snapshots: Pick<AnalyticsSnapshots, "disciplineLog" | "planner">,
  ) {
    return calcStrategicRealityCheck(cards, reviewLog, snapshots.disciplineLog, snapshots.planner);
  },
  runStressPerformance(reviewLog: ReviewLogEntry[], snapshots: Pick<AnalyticsSnapshots, "latency">) {
    return calcStressPerformance(reviewLog, snapshots.latency);
  },
  runFrictionAnalysis(reviewLog: ReviewLogEntry[], limit = 10) {
    return calcFrictionAnalysis(reviewLog, limit);
  },
  runBlindSpots(cards: Card[], snapshots: Pick<AnalyticsSnapshots, "calibration">) {
    return calcBlindSpots(cards, snapshots.calibration);
  },
  runRecovery(snapshots: Pick<AnalyticsSnapshots, "disciplineLog">) {
    return calcRecoveryRate(snapshots.disciplineLog);
  },
  buildCharts(cards: Card[], reviewLog: ReviewLogEntry[], targetReviewPct: number): ChartBundle {
    return buildChartBundle(cards, reviewLog, targetReviewPct);
  },
};

export type AnalyticsWorkerAPI = typeof api;

Comlink.expose(api);
