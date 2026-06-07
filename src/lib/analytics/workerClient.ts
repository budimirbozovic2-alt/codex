/**
 * Lazy singleton wrapper around analytics Web Worker.
 *
 * Design:
 * - Worker is created on first call (preserves TTI).
 * - Comlink API gives async proxy ergonomics.
 * - Sync fallback for non-Worker envs (vitest, SSR).
 * - terminate() registered on beforeunload.
 *
 * PR-H4 Hardening: Vertically expanded catch blocks
 * to ensure Safe-Paste compliance and robust logging.
 */
import * as Comlink from "comlink";
import { logger } from "@/lib/logger";
import { 
  loadCalibration, 
  loadLatency 
} from "@/lib/metacognitive-storage";
import { 
  loadDisciplineLog, 
  loadPlanner 
} from "@/domains/planner";
import type { AnalyticsSnapshots } from "./_pure/types";
import type { AnalyticsWorkerAPI } from "../../workers/analytics.worker";

import { calcInterferencePairs } from "./_pure/interference";
import { 
  calcCategoryStability, 
  calcStrategicRealityCheck 
} from "./_pure/stability";
import { 
  calcStressPerformance, 
  calcFrictionAnalysis 
} from "./_pure/friction";
import { calcBlindSpots } from "./_pure/blind-spots";
import { calcRecoveryRate } from "./_pure/recovery";
import { calcResistance } from "./_pure/resistance";
import { buildChartBundle } from "./_pure/charts";

type Client = Comlink.Remote<AnalyticsWorkerAPI>;

let _worker: Worker | null = null;
let _client: Client | null = null;
let _terminateRegistered = false;

const isWorkerSupported = typeof Worker !== "undefined";

function registerTerminate() {
  if (_terminateRegistered) return;
  if (typeof window === "undefined") return;
  _terminateRegistered = true;
  window.addEventListener("beforeunload", () => {
    try { 
      _worker?.terminate(); 
    } catch { /* noop */ }
    _worker = null;
    _client = null;
  });
}

function getClient(): Client {
  if (_client) return _client;
  _worker = new Worker(
    new URL("../../workers/analytics.worker.ts", import.meta.url), 
    { type: "module", name: "analytics-worker" }
  );
  _worker.addEventListener("error", (e) => {
    logger.error("[analytics-worker] fatal error", e.message);
  });
  _client = Comlink.wrap<AnalyticsWorkerAPI>(_worker);
  registerTerminate();
  return _client;
}

export function snapshot(): AnalyticsSnapshots {
  return {
    calibration: loadCalibration(),
    latency: loadLatency(),
    disciplineLog: loadDisciplineLog(),
    planner: loadPlanner(),
  };
}

export const analyticsClient = {
  async buildCharts(
    cards: Parameters<AnalyticsWorkerAPI["buildCharts"]>[0],
    reviewLog: Parameters<AnalyticsWorkerAPI["buildCharts"]>[1],
    targetReviewPct: number,
  ) {
    if (!isWorkerSupported) {
      return buildChartBundle(cards, reviewLog, targetReviewPct);
    }
    try {
      return await getClient().buildCharts(
        cards, 
        reviewLog, 
        targetReviewPct
      );
    } catch (err) {
      logger.error("[analytics] buildCharts failed, fallback used", err);
      return buildChartBundle(cards, reviewLog, targetReviewPct);
    }
  },

  async runInterference(
    cards: Parameters<AnalyticsWorkerAPI["runInterference"]>[0], 
    limit?: number
  ) {
    if (!isWorkerSupported) return calcInterferencePairs(cards, limit);
    try { 
      return await getClient().runInterference(cards, limit); 
    } catch (err) { 
      logger.error("[analytics] interference fallback invoked", err); 
      return calcInterferencePairs(cards, limit); 
    }
  },

  async runCategoryStability(
    cards: Parameters<AnalyticsWorkerAPI["runCategoryStability"]>[0],
    categories: string[],
    examDateStr: string | null,
  ) {
    if (!isWorkerSupported) {
      return calcCategoryStability(cards, categories, examDateStr);
    }
    try { 
      return await getClient().runCategoryStability(
        cards, 
        categories, 
        examDateStr
      ); 
    } catch (err) { 
      logger.error("[analytics] stability fallback invoked", err); 
      return calcCategoryStability(cards, categories, examDateStr); 
    }
  },

  async runStrategicRealityCheck(
    cards: Parameters<AnalyticsWorkerAPI["runStrategicRealityCheck"]>[0],
    reviewLog: Parameters<AnalyticsWorkerAPI["runStrategicRealityCheck"]>[1],
  ) {
    if (!isWorkerSupported) {
      return calcStrategicRealityCheck(
        cards, 
        reviewLog, 
        loadDisciplineLog(), 
        loadPlanner()
      );
    }
    try { 
      const snap = { 
        disciplineLog: loadDisciplineLog(), 
        planner: loadPlanner() 
      };
      return await getClient().runStrategicRealityCheck(
        cards, 
        reviewLog, 
        snap
      ); 
    } catch (err) { 
      logger.error("[analytics] strategic fallback invoked", err); 
      return calcStrategicRealityCheck(
        cards, 
        reviewLog, 
        loadDisciplineLog(), 
        loadPlanner()
      ); 
    }
  },

  async runStressPerformance(
    reviewLog: Parameters<AnalyticsWorkerAPI["runStressPerformance"]>[0]
  ) {
    if (!isWorkerSupported) {
      return calcStressPerformance(reviewLog, loadLatency());
    }
    try { 
      const snap = { latency: loadLatency() };
      return await getClient().runStressPerformance(reviewLog, snap); 
    } catch (err) { 
      logger.error("[analytics] stress fallback invoked", err); 
      return calcStressPerformance(reviewLog, loadLatency()); 
    }
  },

  async runFrictionAnalysis(
    reviewLog: Parameters<AnalyticsWorkerAPI["runFrictionAnalysis"]>[0], 
    limit?: number
  ) {
    if (!isWorkerSupported) return calcFrictionAnalysis(reviewLog, limit);
    try { 
      return await getClient().runFrictionAnalysis(reviewLog, limit); 
    } catch (err) { 
      logger.error("[analytics] friction fallback invoked", err); 
      return calcFrictionAnalysis(reviewLog, limit); 
    }
  },

  async runBlindSpots(
    cards: Parameters<AnalyticsWorkerAPI["runBlindSpots"]>[0]
  ) {
    if (!isWorkerSupported) {
      return calcBlindSpots(cards, loadCalibration());
    }
    try { 
      const snap = { calibration: loadCalibration() };
      return await getClient().runBlindSpots(cards, snap); 
    } catch (err) { 
      logger.error("[analytics] blindspots fallback invoked", err); 
      return calcBlindSpots(cards, loadCalibration()); 
    }
  },

  async runRecovery() {
    if (!isWorkerSupported) return calcRecoveryRate(loadDisciplineLog());
    try { 
      const snap = { disciplineLog: loadDisciplineLog() };
      return await getClient().runRecovery(snap); 
    } catch (err) { 
      logger.error("[analytics] recovery fallback invoked", err); 
      return calcRecoveryRate(loadDisciplineLog()); 
    }
  },

  async runResistance(
    cards: Parameters<AnalyticsWorkerAPI["runResistance"]>[0],
    categories: string[],
    reviewLog: Parameters<AnalyticsWorkerAPI["runResistance"]>[2],
    weights: Parameters<AnalyticsWorkerAPI["runResistance"]>[3],
  ) {
    if (!isWorkerSupported) {
      return calcResistance(
        cards, 
        categories, 
        reviewLog, 
        loadLatency(), 
        weights
      );
    }
    try { 
      const snap = { latency: loadLatency() };
      return await getClient().runResistance(
        cards, 
        categories, 
        reviewLog, 
        weights, 
        snap
      ); 
    } catch (err) { 
      logger.error("[analytics] resistance fallback invoked", err); 
      return calcResistance(
        cards, 
        categories, 
        reviewLog, 
        loadLatency(), 
        weights
      ); 
    }
  },

  __terminate() {
    try { 
      _worker?.terminate(); 
    } catch { /* noop */ }
    _worker = null;
    _client = null;
  },
};