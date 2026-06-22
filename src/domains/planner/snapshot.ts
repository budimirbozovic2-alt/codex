/**
 * Pure planner snapshot — shared by usePlannerData and useDashboardData.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db-types";
import type { SubjectPlan } from "@/types/planner";
import type { PlannerConfig } from "./types";
import { calcVelocity, calcEstimatedFinish } from "./velocity";
import { generateStudyPlan, calcLearningReviewRatio } from "./plan-generator";
import {
  getSmartSuggestion,
  getPlannerStatus,
  calcDailyTimeRecommendation,
} from "./suggestions";
import { getCognitiveDebt } from "./discipline";
import { countDailyLearnProgress } from "./session-discipline";
import {
  resolveActivePhaseFromPlans,
  resolveActiveSubjectPlan,
} from "@/lib/dashboard/active-phase";

export interface PlannerSnapshotInput {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  categoryRecords: CategoryRecord[];
  config: PlannerConfig;
  totalSections: number;
  learnedSections: number;
  dueCount: number;
}

export interface PlannerSnapshot {
  velocity: number;
  remaining: number;
  estimatedFinish: Date | null;
  subjectPlans: SubjectPlan[];
  activePhase: ReturnType<typeof resolveActivePhaseFromPlans>;
  activeSubjectPlan: SubjectPlan | null;
  smartSuggestion: ReturnType<typeof getSmartSuggestion>;
  plannerStatus: ReturnType<typeof getPlannerStatus>;
  timeRec: ReturnType<typeof calcDailyTimeRecommendation> | null;
  dailyProgress: number;
  dailyQuota: number;
  learningRatio: ReturnType<typeof calcLearningReviewRatio>;
  learnTarget: number;
  reviewTarget: number;
  debt: ReturnType<typeof getCognitiveDebt>;
}

export function computePlannerSnapshot(input: PlannerSnapshotInput): PlannerSnapshot | null {
  const {
    cards,
    reviewLog,
    categoryRecords,
    config,
    totalSections,
    learnedSections,
    dueCount,
  } = input;

  if (!config.finalGoalDate) return null;

  const remaining = totalSections - learnedSections;
  const velocity = calcVelocity(reviewLog, 7);
  const estimatedFinish = calcEstimatedFinish(remaining, velocity);
  const subjectPlans = generateStudyPlan(config, categoryRecords, cards);
  const activeSubjectPlan = resolveActiveSubjectPlan(subjectPlans);
  const activePhase = resolveActivePhaseFromPlans(subjectPlans);
  const smartSuggestion = getSmartSuggestion(
    activeSubjectPlan,
    cards,
    config.finalGoalDate,
    config.bufferPercent,
    config.dailyQuotaOverride,
  );
  const plannerStatus = getPlannerStatus(
    estimatedFinish,
    config.finalGoalDate,
    config.bufferPercent,
  );
  const timeRec = smartSuggestion
    ? calcDailyTimeRecommendation(
        smartSuggestion.suggestedToday,
        dueCount,
        config.dailyAvailableMinutes,
      )
    : null;
  const dailyProgress = countDailyLearnProgress(reviewLog);
  const dailyQuota = smartSuggestion?.suggestedToday ?? 0;
  const overallPct = totalSections > 0 ? Math.round((learnedSections / totalSections) * 100) : 0;
  const learningRatio = calcLearningReviewRatio(overallPct);
  const learnTarget =
    smartSuggestion && smartSuggestion.suggestedToday > 0
      ? Math.ceil((smartSuggestion.suggestedToday * learningRatio.learnPct) / 100)
      : 0;
  const reviewTarget = Math.max(0, dueCount);
  const debt = getCognitiveDebt();

  return {
    velocity,
    remaining,
    estimatedFinish,
    subjectPlans,
    activePhase,
    activeSubjectPlan,
    smartSuggestion,
    plannerStatus,
    timeRec,
    dailyProgress,
    dailyQuota,
    learningRatio,
    learnTarget,
    reviewTarget,
    debt,
  };
}
