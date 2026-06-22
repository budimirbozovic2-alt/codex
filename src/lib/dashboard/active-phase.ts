import { startOfDay } from "date-fns";
import type { SubjectPlan } from "@/types/planner";

function isSameOrBeforeDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() <= startOfDay(b).getTime();
}

function isBeforeDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

function isActiveByDate(plan: SubjectPlan, now: Date): boolean {
  return isSameOrBeforeDay(plan.startDate, now) && isBeforeDay(now, plan.endDate);
}

/**
 * Resolve the currently active subject plan.
 *
 * Priority:
 *  1) plan whose [startDate, endDate) contains today
 *  2) first unfinished plan (pct < 100)
 *  3) first plan (fallback)
 */
export function resolveActiveSubjectPlan(subjectPlans: SubjectPlan[]): SubjectPlan | null {
  if (!subjectPlans || subjectPlans.length === 0) return null;
  const now = new Date();
  const byDate = subjectPlans.find((p) => isActiveByDate(p, now));
  if (byDate) return byDate;
  const unfinished = subjectPlans.find((p) => p.pct < 100);
  return unfinished ?? subjectPlans[0] ?? null;
}

export function resolveActivePhaseFromPlans(subjectPlans: SubjectPlan[]): {
  name: string;
  pct: number;
  learned: number;
  total: number;
} | null {
  const active = resolveActiveSubjectPlan(subjectPlans);
  if (!active) return null;
  return {
    name: active.categoryName,
    pct: active.pct,
    learned: active.learnedSections,
    total: active.totalSections,
  };
}
