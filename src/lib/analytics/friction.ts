// Thin adapter — pulls latency log from main-thread storage and delegates.
import type { ReviewLogEntry } from "../storage";
import { loadLatency } from "../metacognitive-storage";
import {
  calcStressPerformance as calcStressPerformancePure,
  calcFrictionAnalysis,
  type StressPerformance,
  type FrictionInsight,
} from "./_pure/friction";

export { calcFrictionAnalysis };
export type { StressPerformance, FrictionInsight };

export function calcStressPerformance(reviewLog: ReviewLogEntry[]): StressPerformance | null {
  return calcStressPerformancePure(reviewLog, loadLatency());
}
