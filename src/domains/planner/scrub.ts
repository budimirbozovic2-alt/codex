/**
 * S11 — Planner scrub helper. Removes a categoryId from any planner config
 * reference (`subjectOrder`, `hardSubjects`, `phases[].categories`). Moved
 * out of `categoryDeletionOrchestrator` so the planner module owns its own
 * config shape; consumers only know the function contract.
 *
 * Returns `true` if the config was dirty and rewritten, `false` if nothing
 * referenced the category.
 */
import { loadPlanner, savePlanner } from "./config";
import type { PlannerConfig } from "./types";

export function scrubCategoryFromPlannerConfig(categoryId: string): boolean {
  const planner = loadPlanner();
  if (!planner || typeof planner !== "object") return false;

  const cfg: PlannerConfig = { ...planner };
  let dirty = false;

  if (Array.isArray(cfg.subjectOrder) && cfg.subjectOrder.includes(categoryId)) {
    cfg.subjectOrder = cfg.subjectOrder.filter((id) => id !== categoryId);
    dirty = true;
  }
  if (Array.isArray(cfg.hardSubjects) && cfg.hardSubjects.includes(categoryId)) {
    cfg.hardSubjects = cfg.hardSubjects.filter((id) => id !== categoryId);
    dirty = true;
  }
  if (Array.isArray(cfg.phases)) {
    cfg.phases = cfg.phases.map((ph) => {
      if (Array.isArray(ph.categories) && ph.categories.includes(categoryId)) {
        dirty = true;
        return { ...ph, categories: ph.categories.filter((id) => id !== categoryId) };
      }
      return ph;
    });
  }

  if (dirty) savePlanner(cfg);
  return dirty;
}
