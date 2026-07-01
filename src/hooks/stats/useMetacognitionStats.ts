/**
 * Hook boundary for metacognitive-storage reads used by Stats tabs.
 * UI components import these hooks instead of reaching into
 * `@/domains/metacognition/metacognitive-storage` directly (architecture guard).
 */
import { useMemo } from "react";
import type { ReviewLogEntry } from "@/lib/types/logs";
import {
  loadCalibration,
  getCalibrationStats,
  loadLatency,
  getLatencyStats,
  loadSlippageLog,
  getDeepWorkStats,
  getTimeDistribution,
  getWeeklyTimeDistribution,
  getLearningVelocity,
  RESERVOIR_LABELS,
  RESERVOIR_COLORS,
} from "@/domains/metacognition/metacognitive-storage";

export { RESERVOIR_LABELS, RESERVOIR_COLORS };

export function useCalibrationData() {
  const calibration = useMemo(() => loadCalibration(), []);
  const stats = useMemo(() => getCalibrationStats(calibration), [calibration]);
  return { calibration, stats };
}

export function useLatencyData() {
  const latency = useMemo(() => loadLatency(), []);
  const stats = useMemo(() => getLatencyStats(latency), [latency]);
  return { latency, stats };
}

export function useEfficiencyData() {
  const slippageLog = useMemo(() => loadSlippageLog(), []);
  const deepWork = useMemo(() => getDeepWorkStats(7), []);
  const deepWork30 = useMemo(() => getDeepWorkStats(30), []);
  const todayTime = useMemo(() => getTimeDistribution(1), []);
  const weekTime = useMemo(() => getTimeDistribution(7), []);
  const weeklyChart = useMemo(() => getWeeklyTimeDistribution(), []);
  return { slippageLog, deepWork, deepWork30, todayTime, weekTime, weeklyChart };
}

export function useLearningVelocity(
  reviewLog: ReviewLogEntry[],
  categories: string[],
) {
  return useMemo(
    () => getLearningVelocity(reviewLog, categories),
    [reviewLog, categories],
  );
}
