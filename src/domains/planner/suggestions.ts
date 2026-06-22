/** Smart load balancing, rebalanced quota, status, and time recommendation. */
import { addDays, differenceInDays } from "date-fns";
import type { Card } from "@/lib/spaced-repetition";
import type { StudyPhase, SmartSuggestion, PlannerStatus } from "./types";
import type { SubjectPlan } from "@/types/planner";
import { calcPhaseProgress } from "./phases";

export function getSmartSuggestion(
  phase: SubjectPlan | StudyPhase | null,
  cards: Card[],
  goalDateStr: string | null,
  bufferPct: number,
  quotaOverride: number | null = null,
): SmartSuggestion | null {
  if (!goalDateStr) return null;
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const rawDaysLeft = differenceInDays(effectiveGoal, new Date());
  if (rawDaysLeft <= 0) {
    return { suggestedToday: 0, message: "Rok je prošao. Ažuriraj datum ispita u planeru.", burnoutWarning: false };
  }
  const daysLeft = rawDaysLeft;

  let remaining: number;
  const phaseName = phase
    ? ("categoryName" in phase ? phase.categoryName : phase.name)
    : null;
  if (phase && "totalSections" in phase && "learnedSections" in phase) {
    remaining = Math.max(0, phase.totalSections - phase.learnedSections);
  } else if (phase) {
    const prog = calcPhaseProgress(phase as StudyPhase, cards);
    remaining = prog.remainingCards;
  } else {
    let total = 0, learned = 0;
    cards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
    remaining = total - learned;
  }

  if (remaining <= 0) return { suggestedToday: 0, message: "Sve cjeline su naučene! 🎉", burnoutWarning: false };
  const needed = Math.ceil(remaining / daysLeft);
  const suggestedToday =
    quotaOverride != null && quotaOverride > 0 ? quotaOverride : needed;
  const burnoutWarning = suggestedToday > 60;
  const message =
    quotaOverride != null && quotaOverride > 0
      ? `Nivelisan plan: ${suggestedToday} novih cjelina/dan (${daysLeft} dana do cilja).`
      : phaseName
        ? `Fokus: ${phaseName}. Obradi bar ${suggestedToday} novih cjelina danas da ostaneš na planu.`
        : `Obradi bar ${suggestedToday} novih cjelina danas da ostaneš na planu.`;
  return { suggestedToday, message, burnoutWarning };
}

export function calcRebalancedQuota(
  totalRemaining: number, goalDateStr: string | null, bufferPct: number,
): { newDailyQuota: number; daysLeft: number } | null {
  if (!goalDateStr) return null;
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const daysLeft = Math.max(1, differenceInDays(effectiveGoal, new Date()));
  return { newDailyQuota: Math.ceil(totalRemaining / daysLeft), daysLeft };
}

export function getPlannerStatus(
  estimatedFinish: Date | null, goalDateStr: string | null, bufferPct: number = 0,
): { status: PlannerStatus; daysLate: number } {
  if (!goalDateStr || !estimatedFinish) return { status: "no-goal", daysLate: 0 };
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const diff = differenceInDays(estimatedFinish, effectiveGoal);
  if (diff <= 0) return { status: "green", daysLate: 0 };
  if (diff < 14) return { status: "yellow", daysLate: diff };
  return { status: "red", daysLate: diff };
}

function formatMinutesLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
  return `${minutes} min`;
}

export function calcDailyTimeRecommendation(
  suggestedSections: number,
  dueCount: number,
  dailyAvailableMinutes: number = 0,
  avgMinPerSection: number = 3,
): { totalMinutes: number; hours: number; minutes: number; message: string; fitsBudget: boolean } {
  const totalSections = suggestedSections + dueCount;
  const totalMinutes = Math.round(totalSections * avgMinPerSection);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const baseMessage =
    hours > 0 ? `${hours}h ${minutes}min efektivnog učenja` : `${minutes} min efektivnog učenja`;

  if (dailyAvailableMinutes <= 0) {
    return { totalMinutes, hours, minutes, message: baseMessage, fitsBudget: true };
  }

  const budgetLabel = formatMinutesLabel(dailyAvailableMinutes);
  const fitsBudget = totalMinutes <= dailyAvailableMinutes;
  const message = fitsBudget
    ? `${baseMessage} (unutar ${budgetLabel} dnevno)`
    : `${baseMessage} — premašuje tvojih ${budgetLabel} dnevno`;

  return { totalMinutes, hours, minutes, message, fitsBudget };
}
