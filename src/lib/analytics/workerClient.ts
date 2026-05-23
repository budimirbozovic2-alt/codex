/**
 * Lazy singleton wrapper around the analytics Web Worker.
 *
 * Design:
 *   • Worker is created on first call, never at app boot (preserves TTI).
 *   • Comlink-proxied API gives `await client.runX(...)` ergonomics.
 *   • Sync fallback for environments without `Worker` (vitest, SSR probes,
 *     ancient runtimes) — runs the `_pure` modules in-band so tests stay
 *     deterministic and the UI still works.
 *   • `terminate()` registered on `beforeunload` so Electron close + browser
 *     navigation don't leak the worker.
 */
import * as Comlink from "comlink";
import { logger } from "@/lib/logger";
import { loadCalibration, loadLatency } from "@/lib/metacognitive-storage";
import { loadDisciplineLog } from "@/lib/planner/discipline";
import { loadPlanner } from "@/lib/planner/config";
import type { AnalyticsSnapshots } from "./_pure/types";
import type { AnalyticsWorkerAPI } from "../../workers/analytics.worker";

// Sync fallbacks — re-export pure callees so test envs can short-circuit.
import { calcInterferencePairs } from "./_pure/interference";
import { calcCategoryStability, calcStrategicRealityCheck } from "./_pure/stability";
import { calcStressPerformance, calcFrictionAnalysis } from "./_pure/friction";
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
    try { _worker?.terminate(); } catch { /* noop */ }
    _worker = null;
    _client = null;
  });
}

function getClient(): Client {
  if (_client) return _client;
  _worker = new Worker(new URL("../../workers/analytics.worker.ts", import.meta.url), {
    type: "module",
    name: "analytics-worker",
  });
  _worker.addEventListener("error", (e) => {
    logger.error("[analytics-worker] error", e.message);
  });
  _client = Comlink.wrap<AnalyticsWorkerAPI>(_worker);
  registerTerminate();
  return _client;
}

/**
 * Snapshot all localStorage-backed inputs at the call site so the worker
 * receives plain structured-cloneable data and never touches IDB.
 */
export function snapshot(): AnalyticsSnapshots {
  return {
    calibration: loadCalibration(),
    latency: loadLatency(),
    disciplineLog: loadDisciplineLog(),
    planner: loadPlanner(),
  };
}

/**
 * Public API: prefer the worker, fall back to sync `_pure` execution when
 * Workers are unavailable (vitest, etc.) or the worker errors out.
 */
export const analyticsClient = {
  async buildCharts(
    cards: Parameters<AnalyticsWorkerAPI["buildCharts"]>[0],
    reviewLog: Parameters<AnalyticsWorkerAPI["buildCharts"]>[1],
    targetReviewPct: number,
  ) {
    if (!isWorkerSupported) return buildChartBundle(cards, reviewLog, targetReviewPct);
    try {
      return await getClient().buildCharts(cards, reviewLog, targetReviewPct);
    } catch (err) {
      logger.warn("[analytics-worker] buildCharts failed, falling back to main thread", err);
      return buildChartBundle(cards, reviewLog, targetReviewPct);
    }
  },

  async runInterference(cards: Parameters<AnalyticsWorkerAPI["runInterference"]>[0], limit?: number) {
    if (!isWorkerSupported) return calcInterferencePairs(cards, limit);
    try { return await getClient().runInterference(cards, limit); }
    catch (err) { logger.warn("[analytics-worker] interference fallback", err); return calcInterferencePairs(cards, limit); }
  },

  async runCategoryStability(
    cards: Parameters<AnalyticsWorkerAPI["runCategoryStability"]>[0],
    categories: string[],
    examDateStr: string | null,
  ) {
    if (!isWorkerSupported) return calcCategoryStability(cards, categories, examDateStr);
    try { return await getClient().runCategoryStability(cards, categories, examDateStr); }
    catch (err) { logger.warn("[analytics-worker] stability fallback", err); return calcCategoryStability(cards, categories, examDateStr); }
  },

  async runStrategicRealityCheck(
    cards: Parameters<AnalyticsWorkerAPI["runStrategicRealityCheck"]>[0],
    reviewLog: Parameters<AnalyticsWorkerAPI["runStrategicRealityCheck"]>[1],
  ) {
    const snap = { disciplineLog: loadDisciplineLog(), planner: loadPlanner() };
    if (!isWorkerSupported) return calcStrategicRealityCheck(cards, reviewLog, snap.disciplineLog, snap.planner);
    try { return await getClient().runStrategicRealityCheck(cards, reviewLog, snap); }
    catch (err) { logger.warn("[analytics-worker] strategic fallback", err); return calcStrategicRealityCheck(cards, reviewLog, snap.disciplineLog, snap.planner); }
  },

  async runStressPerformance(reviewLog: Parameters<AnalyticsWorkerAPI["runStressPerformance"]>[0]) {
    const snap = { latency: loadLatency() };
    if (!isWorkerSupported) return calcStressPerformance(reviewLog, snap.latency);
    try { return await getClient().runStressPerformance(reviewLog, snap); }
    catch (err) { logger.warn("[analytics-worker] stress fallback", err); return calcStressPerformance(reviewLog, snap.latency); }
  },

  async runFrictionAnalysis(reviewLog: Parameters<AnalyticsWorkerAPI["runFrictionAnalysis"]>[0], limit?: number) {
    if (!isWorkerSupported) return calcFrictionAnalysis(reviewLog, limit);
    try { return await getClient().runFrictionAnalysis(reviewLog, limit); }
    catch (err) { logger.warn("[analytics-worker] friction fallback", err); return calcFrictionAnalysis(reviewLog, limit); }
  },

  async runBlindSpots(cards: Parameters<AnalyticsWorkerAPI["runBlindSpots"]>[0]) {
    const snap = { calibration: loadCalibration() };
    if (!isWorkerSupported) return calcBlindSpots(cards, snap.calibration);
    try { return await getClient().runBlindSpots(cards, snap); }
    catch (err) { logger.warn("[analytics-worker] blind-spots fallback", err); return calcBlindSpots(cards, snap.calibration); }
  },

  async runRecovery() {
    const snap = { disciplineLog: loadDisciplineLog() };
    if (!isWorkerSupported) return calcRecoveryRate(snap.disciplineLog);
    try { return await getClient().runRecovery(snap); }
    catch (err) { logger.warn("[analytics-worker] recovery fallback", err); return calcRecoveryRate(snap.disciplineLog); }
  },

  async runResistance(
    cards: Parameters<AnalyticsWorkerAPI["runResistance"]>[0],
    categories: string[],
    reviewLog: Parameters<AnalyticsWorkerAPI["runResistance"]>[2],
    weights: Parameters<AnalyticsWorkerAPI["runResistance"]>[3],
  ) {
    const snap = { latency: loadLatency() };
    if (!isWorkerSupported) return calcResistance(cards, categories, reviewLog, snap.latency, weights);
    try { return await getClient().runResistance(cards, categories, reviewLog, weights, snap); }
    catch (err) { logger.warn("[analytics-worker] resistance fallback", err); return calcResistance(cards, categories, reviewLog, snap.latency, weights); }
  },

  /** Test/teardown hook. Not needed in production. */
  __terminate() {
    try { _worker?.terminate(); } catch { /* noop */ }
    _worker = null;
    _client = null;
  },
};
