/** Smart load balancing, rebalanced quota, status, and time recommendation. */
import { addDays, differenceInDays } from "date-fns";
import type { Card } from "../spaced-repetition";
import type { StudyPhase, SmartSuggestion, PlannerStatus } from "./types";
import { calcPhaseProgress } from "./phases";

export function getSmartSuggestion(
  phase: StudyPhase | null,
  cards: Card[],
  goalDateStr: string | null,
  velocity: number,
  bufferPct: number,
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
  if (phase) {
    const prog = calcPhaseProgress(phase, cards);
    remaining = prog.remainingCards;
  } else {
    let total = 0, learned = 0;
    cards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
    remaining = total - learned;
  }

  if (remaining <= 0) return { suggestedToday: 0, message: "Sve cjeline su naučene! 🎉", burnoutWarning: false };
  const needed = Math.ceil(remaining / daysLeft);
  const burnoutWarning = needed > 60;
  return {
    suggestedToday: needed,
    message: `Obradi bar ${needed} novih cjelina danas da ostaneš na planu.`,
    burnoutWarning,
  };
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

export function calcDailyTimeRecommendation(
  suggestedSections: number, velocity: number, dueCount: number, avgMinPerSection: number = 3,
): { totalMinutes: number; hours: number; minutes: number; message: string } {
  void velocity;
  const totalSections = suggestedSections + dueCount;
  const totalMinutes = Math.round(totalSections * avgMinPerSection);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const message = hours > 0 ? `${hours}h ${minutes}min efektivnog učenja` : `${minutes} min efektivnog učenja`;
  return { totalMinutes, hours, minutes, message };
}
