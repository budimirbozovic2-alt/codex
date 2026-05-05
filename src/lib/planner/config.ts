/** Config CRUD — sync getters backed by `cache`, IDB writes through `enqueueWrite`. */
import { db } from "../db";
import { plannerCache, enqueueWrite } from "./cache";
import type { PlannerConfig } from "./types";

export function loadPlanner(): PlannerConfig {
  return plannerCache.get();
}

export function savePlanner(config: PlannerConfig): void {
  plannerCache.set(config);
  enqueueWrite("savePlanner", () => db.settings.put({ key: "plannerConfig", value: config }));
}
