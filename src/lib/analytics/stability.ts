// Thin adapter — loads planner snapshots from main-thread storage and
// delegates to `_pure/stability.ts`.
import type { Card } from "../spaced-repetition";
import type { ReviewLogEntry } from "../storage";
import { loadDisciplineLog, loadPlanner } from "@/domains/planner";
import {
  calcCategoryStability,
  calcStrategicRealityCheck as calcStrategicRealityCheckPure,
  type CategoryStabilityInfo,
  type StrategicAlert,
} from "./_pure/stability";

export { calcCategoryStability };
export type { CategoryStabilityInfo, StrategicAlert };

export function calcStrategicRealityCheck(
  cards: Card[],
  reviewLog: ReviewLogEntry[],
): StrategicAlert | null {
  return calcStrategicRealityCheckPure(cards, reviewLog, loadDisciplineLog(), loadPlanner());
}
