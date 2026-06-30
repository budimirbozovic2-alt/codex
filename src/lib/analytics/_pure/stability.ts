// Pure category-stability + strategic reality check. Receives planner snapshots
// (loaded on main thread) so the worker never touches storage.
import { addDays, differenceInDays, startOfDay } from "date-fns";
import type { Card } from "@/lib/sr/types";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { DisciplineEntry, PlannerConfig } from "@/domains/planner";

export interface CategoryStabilityInfo {
  category: string;
  avgStability: number;
  avgRetrievability: number;
  criticalSections: number;
  totalSections: number;
}

export function calcCategoryStability(
  cards: Card[],
  categories: string[],
  examDateStr: string | null,
): CategoryStabilityInfo[] {
  const parsedExamDate = examDateStr ? new Date(examDateStr) : null;
  const examDate = parsedExamDate && !isNaN(parsedExamDate.getTime()) ? parsedExamDate : null;
  const daysToExam = examDate ? Math.max(0, differenceInDays(examDate, new Date())) : null;

  return categories.map(cat => {
    const catCards = cards.filter(c => c.categoryId === cat);
    let totalStability = 0;
    let totalRetrievability = 0;
    let criticalCount = 0;
    let sectionCount = 0;

    catCards.forEach(c => {
      c.sections.forEach(s => {
        if (!s.lastReviewed) return;
        sectionCount++;
        totalStability += s.stability;

        const elapsed = (Date.now() - s.lastReviewed) / (24 * 60 * 60 * 1000);
        const R = s.stability > 0 ? Math.exp(-elapsed / s.stability) : 0;
        totalRetrievability += R;

        if (daysToExam !== null && s.stability > 0) {
          const totalElapsed = elapsed + daysToExam;
          const futureR = Math.exp(-totalElapsed / s.stability);
          if (futureR < 0.85) criticalCount++;
        }
      });
    });

    return {
      category: cat,
      avgStability: sectionCount > 0 ? totalStability / sectionCount : 0,
      avgRetrievability: sectionCount > 0 ? totalRetrievability / sectionCount : 0,
      criticalSections: criticalCount,
      totalSections: sectionCount,
    };
  }).filter(c => c.totalSections > 0);
}

export interface StrategicAlert {
  type: "ambitious" | "on-track" | "none";
  message: string;
  diligentDays: number;
  totalDays: number;
  daysLate: number;
}

// Inlined pure planner math so this module has zero deps on planner/cache.
function calcVelocityPure(reviewLog: ReviewLogEntry[], days = 7): number {
  const cutoff = startOfDay(addDays(new Date(), -days)).getTime();
  const now = Date.now();
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach((e) => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });
  let newInWindow = 0;
  sectionFirstSeen.forEach((ts) => { if (ts >= cutoff && ts <= now) newInWindow++; });
  return days > 0 ? newInWindow / days : 0;
}

function calcEstimatedFinishPure(remaining: number, velocity: number): Date | null {
  if (velocity <= 0 || remaining <= 0) return remaining <= 0 ? new Date() : null;
  return addDays(new Date(), Math.ceil(remaining / velocity));
}

function getPlannerStatusPure(
  estimatedFinish: Date | null, goalDateStr: string | null, bufferPct = 0,
): { status: "green" | "yellow" | "red" | "no-goal"; daysLate: number } {
  if (!goalDateStr || !estimatedFinish) return { status: "no-goal", daysLate: 0 };
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const diff = differenceInDays(estimatedFinish, effectiveGoal);
  if (diff <= 0) return { status: "green", daysLate: 0 };
  if (diff < 14) return { status: "yellow", daysLate: diff };
  return { status: "red", daysLate: diff };
}

export function calcStrategicRealityCheck(
  cards: Card[],
  reviewLog: ReviewLogEntry[],
  disciplineLog: DisciplineEntry[],
  planner: PlannerConfig | null,
): StrategicAlert | null {
  if (!planner?.finalGoalDate) return null;
  if (disciplineLog.length < 5) return null;

  const recent = disciplineLog.slice(-14);
  const diligentDays = recent.filter(e => e.status === "diligent").length;
  const diligentPct = diligentDays / recent.length;

  const totalSections = cards.reduce((s, c) => s + c.sections.length, 0);
  const learnedSections = cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0);
  const velocity = calcVelocityPure(reviewLog, 7);
  const remaining = totalSections - learnedSections;
  const estimated = calcEstimatedFinishPure(remaining, velocity);
  const status = getPlannerStatusPure(estimated, planner.finalGoalDate);

  if (diligentPct >= 0.6 && status.status !== "green" && status.daysLate > 3) {
    return {
      type: "ambitious",
      message: `Plan je previše ambiciozan za tvoj trenutni tempo. Vrijedan si ${diligentDays} od ${recent.length} dana, ali projekcija kasni ${status.daysLate} dana. Razmisli o reviziji cilja.`,
      diligentDays,
      totalDays: recent.length,
      daysLate: status.daysLate,
    };
  }

  return null;
}
