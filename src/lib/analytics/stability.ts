import { Card } from "../spaced-repetition";
import { ReviewLogEntry } from "../storage";
import { loadDisciplineLog, loadPlanner, calcVelocity, calcEstimatedFinish, getPlannerStatus } from "../planner-storage";
import { differenceInDays } from "date-fns";

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
  examDateStr: string | null
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

export function calcStrategicRealityCheck(
  cards: Card[],
  reviewLog: ReviewLogEntry[]
): StrategicAlert | null {
  const planner = loadPlanner();
  if (!planner.finalGoalDate) return null;

  const log = loadDisciplineLog();
  if (log.length < 5) return null;

  const recent = log.slice(-14);
  const diligentDays = recent.filter(e => e.status === "diligent").length;
  const diligentPct = diligentDays / recent.length;

  const totalSections = cards.reduce((s, c) => s + c.sections.length, 0);
  const learnedSections = cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0);
  const velocity = calcVelocity(reviewLog, 7);
  const remaining = totalSections - learnedSections;
  const estimated = calcEstimatedFinish(remaining, velocity);
  const status = getPlannerStatus(estimated, planner.finalGoalDate);

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
