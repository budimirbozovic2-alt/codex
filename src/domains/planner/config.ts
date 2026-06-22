/** Config CRUD — sync getter backed by `cache`, write delegated to SQLite-primary repo. */
import { logger } from "@/lib/logger";
import { plannerCache } from "./cache";
import { savePlannerConfig } from "@/lib/db/queries";
import type { PlannerConfig } from "./types";

export function loadPlanner(): PlannerConfig {
  return plannerCache.get();
}

export async function savePlanner(config: PlannerConfig): Promise<void> {
  const prev = plannerCache.get();
  plannerCache.set(config);
  try {
    await savePlannerConfig(config);
  } catch (err) {
    plannerCache.set(prev);
    logger.warn("[planner] savePlannerConfig failed — cache rolled back", err);
    throw err instanceof Error ? err : new Error(String(err));
  }
}
