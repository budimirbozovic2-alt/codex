/**
 * Planner namespace barrel.
 *
 * Decomposed from the previous `planner-storage.ts` God Module (~580 LOC, 25+
 * exports). Sub-modules are organized by responsibility:
 *
 *   types          — Pure data shapes + DEFAULT_CONFIG
 *   cache          — In-memory caches (SQLite-primary persistence)
 *   config         — Planner config CRUD
 *   velocity       — Velocity, finish projection, projection text
 *   phases         — Phase progress + discipline percentage
 *   suggestions    — Smart suggestion, rebalanced quota, status, time recommendation
 *   burnup         — Burn-up chart data builder
 *   discipline     — Discipline log CRUD + classification + cognitive debt + trend
 *   daily-mapped   — Daily-mapped counter + auto-redistribute
 *   plan-generator — Subject-oriented plan + learning/review ratio
 *
 * The legacy module path `@/domains/planner` is kept as a thin re-export
 * shim for backward compatibility.
 */

export type {
  StudyPhase,
  StudyDecade,
  PlannerConfig,
  PhaseProgress,
  SmartSuggestion,
  PlannerStatus,
  DisciplineStatus,
  DisciplineEntry,
  DailyPhaseProgress,
} from "./types";
export { DEFAULT_CONFIG } from "./types";

export { initPlannerCache, type PlannerChangeKind } from "./cache";
export { loadPlanner, savePlanner } from "./config";
export { scrubCategoryFromPlannerConfig } from "./scrub";
export { calcVelocity, calcEstimatedFinish, getProjectionText } from "./velocity";
export { calcPhaseProgress, getPhaseDisciplinePct } from "./phases";
export {
  getSmartSuggestion,
  calcRebalancedQuota,
  getPlannerStatus,
  calcDailyTimeRecommendation,
} from "./suggestions";
export { buildBurnupData } from "./burnup";
export {
  loadDisciplineLog,
  saveDisciplineLog,
  calcDisciplineStatus,
  getDisciplineEmoji,
  getDisciplineLabel,
  recordDayDiscipline,
  getCognitiveDebt,
  getDisciplineTrend,
} from "./discipline";
export {
  getDailyMappedCount,
  incrementDailyMapped,
  autoRedistributeIfNeeded,
} from "./daily-mapped";
export { generateStudyPlan, calcLearningReviewRatio } from "./plan-generator";
