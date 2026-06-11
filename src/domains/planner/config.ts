/** Config CRUD — sync getter backed by `cache`, write delegated to SQLite-primary repo. */
import { plannerCache } from "./cache";
import { savePlannerConfig } from "@/lib/db/queries";
import type { PlannerConfig } from "./types";

export function loadPlanner(): PlannerConfig {
  return plannerCache.get();
}

export function savePlanner(config: PlannerConfig): void {
  plannerCache.set(config);
  void savePlannerConfig(config);
}
