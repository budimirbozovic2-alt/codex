/**
 * TanStack authoritative cache for planner domain (config, discipline, counters).
 * Replaces module-level `_plannerCache` mirrors — SQLite seeds on boot, writes
 * seed TanStack then notify derived planner queries via bridge.
 */
import type { PlannerConfig, DisciplineEntry } from "@/domains/planner/types";
import { DEFAULT_CONFIG, PLANNER_CONFIG_VERSION } from "@/domains/planner/types";
import type { StudyDecade } from "@/domains/planner/types";
import { loadPlannerSnapshot } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import {
  invalidatePlannerConfigDerived,
  invalidatePlannerDisciplineDerived,
} from "./domain-invalidation";
import { queryClient } from "./client";
import { queryKeys } from "./keys";

export interface DailyMappedSlot {
  date: string;
  count: number;
}

const EMPTY_DISCIPLINE: DisciplineEntry[] = [];
const EMPTY_DAILY_MAPPED: DailyMappedSlot = { date: "", count: 0 };

export function resetPlannerQueryCache(): void {
  queryClient.removeQueries({ queryKey: queryKeys.planner.root });
}

export function getPlannerConfigFromCache(): PlannerConfig {
  return (
    queryClient.getQueryData<PlannerConfig>(queryKeys.planner.config())
    ?? { ...DEFAULT_CONFIG, createdAt: Date.now() }
  );
}

export function seedPlannerConfig(
  config: PlannerConfig,
  options?: { notify?: boolean },
): void {
  queryClient.setQueryData(queryKeys.planner.config(), config);
  if (options?.notify) {
    invalidatePlannerConfigDerived();
  }
}

export function getDisciplineLogFromCache(): DisciplineEntry[] {
  return (
    queryClient.getQueryData<DisciplineEntry[]>(queryKeys.planner.disciplineLog())
    ?? EMPTY_DISCIPLINE
  );
}

export function seedDisciplineLog(
  log: DisciplineEntry[],
  options?: { notify?: boolean },
): void {
  queryClient.setQueryData(queryKeys.planner.disciplineLog(), [...log]);
  if (options?.notify) {
    invalidatePlannerDisciplineDerived();
  }
}

export function getDailyMappedFromCache(): DailyMappedSlot {
  return (
    queryClient.getQueryData<DailyMappedSlot>(queryKeys.planner.dailyMapped())
    ?? EMPTY_DAILY_MAPPED
  );
}

export function seedDailyMapped(
  slot: DailyMappedSlot,
  options?: { notify?: boolean },
): void {
  queryClient.setQueryData(queryKeys.planner.dailyMapped(), slot);
}

export function getLastRedistributeFromCache(): string {
  return queryClient.getQueryData<string>(queryKeys.planner.lastRedistribute()) ?? "";
}

export function seedLastRedistribute(
  date: string,
  options?: { notify?: boolean },
): void {
  queryClient.setQueryData(queryKeys.planner.lastRedistribute(), date);
}

/** Boot — read SQLite snapshot and seed TanStack planner slots. */
export async function initPlannerQueryCache(): Promise<void> {
  try {
    const snap = await loadPlannerSnapshot();

    if (snap.plannerConfig) {
      const parsed = snap.plannerConfig as Record<string, unknown>;
      const version = typeof parsed.configVersion === "number" ? parsed.configVersion : 1;
      let config: PlannerConfig;
      if (version < 2 && "decades" in parsed && !("phases" in parsed)) {
        const decades = (parsed as Record<string, unknown>).decades as StudyDecade[];
        const phases = decades.map((d: StudyDecade) => ({
          id: d.id,
          name: d.name,
          expectedDays: d.durationDays,
          categories: d.categories,
        }));
        const migrated = { ...parsed, phases } as Record<string, unknown>;
        delete migrated.decades;
        migrated.configVersion = PLANNER_CONFIG_VERSION;
        config = {
          ...DEFAULT_CONFIG,
          ...(migrated as unknown as Partial<PlannerConfig>),
        };
      } else {
        config = {
          ...DEFAULT_CONFIG,
          ...(parsed as Partial<PlannerConfig>),
          configVersion: PLANNER_CONFIG_VERSION,
        };
      }
      seedPlannerConfig(config);
    } else {
      seedPlannerConfig({ ...DEFAULT_CONFIG, createdAt: Date.now() });
    }

    seedDisciplineLog((snap.disciplineLog as DisciplineEntry[]) ?? []);
    if (snap.dailyMapped) {
      seedDailyMapped(snap.dailyMapped as DailyMappedSlot);
    }
    if (snap.lastRedistribute) {
      seedLastRedistribute(snap.lastRedistribute as string);
    }
  } catch (err) {
    logger.warn("[planner-cache] init failed, using defaults", err);
    seedPlannerConfig({ ...DEFAULT_CONFIG, createdAt: Date.now() });
    seedDisciplineLog([]);
  }
}
