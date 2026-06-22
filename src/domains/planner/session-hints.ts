/**
 * Planner session limits — learn/review queue caps and banner copy.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { CategoryRecord } from "@/lib/db-types";
import { loadPlanner } from "./config";
import { computePlannerSnapshot } from "./snapshot";

export interface PlannerSessionHintsInput {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  categoryRecords: CategoryRecord[];
  dueCount: number;
  /** Scoped due when review/learn is category-locked. */
  scopedDueCount?: number;
}

export interface PlannerSessionHints {
  enabled: boolean;
  focusCategoryName: string | null;
  dailyProgress: number;
  dailyQuota: number;
  learnTarget: number;
  reviewTarget: number;
  /** Sections left in today's learn budget (hard cap for LearnSession). */
  learnRemaining: number;
  /** Sections left in today's review budget (hard cap for ReviewSession). */
  reviewRemaining: number;
}

function countSections(cards: readonly Card[]): { total: number; learned: number } {
  let total = 0;
  let learned = 0;
  for (const c of cards) {
    for (const s of c.sections) {
      total++;
      if (s.lastReviewed) learned++;
    }
  }
  return { total, learned };
}

export function computePlannerSessionHints(
  input: PlannerSessionHintsInput,
): PlannerSessionHints {
  const config = loadPlanner();
  const empty: PlannerSessionHints = {
    enabled: false,
    focusCategoryName: null,
    dailyProgress: 0,
    dailyQuota: 0,
    learnTarget: 0,
    reviewTarget: 0,
    learnRemaining: 0,
    reviewRemaining: 0,
  };

  if (!config.finalGoalDate) return empty;

  const { total, learned } = countSections(input.cards);
  const due = input.scopedDueCount ?? input.dueCount;
  const snapshot = computePlannerSnapshot({
    cards: input.cards,
    reviewLog: input.reviewLog,
    categoryRecords: input.categoryRecords,
    config,
    totalSections: total,
    learnedSections: learned,
    dueCount: input.dueCount,
  });

  if (!snapshot) return empty;

  const { dailyProgress, dailyQuota, learnTarget, reviewTarget, activeSubjectPlan } = snapshot;
  const totalRemaining = Math.max(0, dailyQuota - dailyProgress);
  const learnRemaining = Math.max(0, learnTarget - dailyProgress);
  const reviewBudget = Math.max(0, dailyQuota - Math.max(dailyProgress, learnTarget));
  const reviewRemaining = Math.max(0, Math.min(due, reviewTarget, reviewBudget || totalRemaining));

  return {
    enabled: true,
    focusCategoryName: activeSubjectPlan?.categoryName ?? null,
    dailyProgress,
    dailyQuota,
    learnTarget,
    reviewTarget,
    learnRemaining,
    reviewRemaining,
  };
}

/** Apply hard cap to a queue length (0 = planner budget exhausted). */
export function capQueueLength(length: number, remaining: number, enabled: boolean): number {
  if (!enabled) return length;
  if (remaining <= 0) return 0;
  return Math.min(length, remaining);
}
