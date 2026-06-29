/**
 * Planner domain change notifications — TanStack is the read cache
 * (see `planner-cache-coordinator.ts`).
 */
import type { PlannerConfig, DisciplineEntry } from "./types";
import {
  getPlannerConfigFromCache,
  seedPlannerConfig,
  getDisciplineLogFromCache,
  seedDisciplineLog,
  getDailyMappedFromCache,
  seedDailyMapped,
  getLastRedistributeFromCache,
  seedLastRedistribute,
  initPlannerQueryCache,
  type DailyMappedSlot,
} from "@/lib/query/planner-cache-coordinator";
import type { PlannerChangedKind } from "@/lib/query/cache-scope-types";

export type { PlannerChangedKind as PlannerChangeKind };
export type { DailyMappedSlot };

export const plannerCache = {
  get: (): PlannerConfig => getPlannerConfigFromCache(),
  set: (next: PlannerConfig): void => {
    seedPlannerConfig(next, { notify: true });
  },
};

export const disciplineCache = {
  get: (): DisciplineEntry[] => getDisciplineLogFromCache(),
  set: (next: DisciplineEntry[]): void => {
    seedDisciplineLog(next, { notify: true });
  },
};

export const dailyMappedCache = {
  get: (): DailyMappedSlot => getDailyMappedFromCache(),
  set: (next: DailyMappedSlot): void => {
    seedDailyMapped(next, { notify: true });
  },
};

export const lastRedistributeCache = {
  get: (): string => getLastRedistributeFromCache(),
  set: (next: string): void => {
    seedLastRedistribute(next, { notify: true });
  },
};

/** @deprecated Use `initPlannerQueryCache` from planner-cache-coordinator. */
export async function initPlannerCache(): Promise<void> {
  return initPlannerQueryCache();
}

export { initPlannerQueryCache };
