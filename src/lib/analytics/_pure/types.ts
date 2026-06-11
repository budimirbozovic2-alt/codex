/**
 * Snapshot inputs for `_pure/*` analytics modules.
 *
 * Pure modules must NEVER import `@/lib/storage`, `localStorage`, `@/contexts/**`,
 * `@/lib/db**` or any React. Storage reads happen in main-thread adapters which
 * call `_pure` with these snapshots. This guarantees that the same code can run
 * unchanged inside `src/workers/analytics.worker.ts`.
 */
import type { CalibrationEntry, LatencyEntry } from "@/domains/metacognition/metacognitive-storage";
import type { DisciplineEntry, PlannerConfig } from "@/domains/planner";

export interface AnalyticsSnapshots {
  calibration: CalibrationEntry[];
  latency: LatencyEntry[];
  disciplineLog: DisciplineEntry[];
  planner: PlannerConfig | null;
}

export type { CalibrationEntry, LatencyEntry, DisciplineEntry, PlannerConfig };
