import { Card } from "./spaced-repetition";
import { ReviewLogEntry } from "./storage";
import { addDays, differenceInDays, startOfDay } from "date-fns";

const PLANNER_KEY = "sr-planner-config";

export interface StudyDecade {
  id: string;
  name: string;
  durationDays: number;
  categories: string[];
  startDate: string; // ISO date
}

export interface PlannerConfig {
  decades: StudyDecade[];
  finalGoalDate: string | null;
  createdAt: number;
}

const DEFAULT_CONFIG: PlannerConfig = {
  decades: [],
  finalGoalDate: null,
  createdAt: Date.now(),
};

export function loadPlanner(): PlannerConfig {
  try {
    const data = localStorage.getItem(PLANNER_KEY);
    return data ? { ...DEFAULT_CONFIG, ...JSON.parse(data) } : { ...DEFAULT_CONFIG, createdAt: Date.now() };
  } catch {
    return { ...DEFAULT_CONFIG, createdAt: Date.now() };
  }
}

export function savePlanner(config: PlannerConfig): void {
  localStorage.setItem(PLANNER_KEY, JSON.stringify(config));
}

/**
 * Calculate velocity: average new sections learned per day over last N days.
 */
export function calcVelocity(reviewLog: ReviewLogEntry[], days: number = 7): number {
  const now = Date.now();
  const cutoff = startOfDay(addDays(new Date(), -days)).getTime();

  // Find sections first seen within the window
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach((e) => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });

  let newInWindow = 0;
  sectionFirstSeen.forEach((ts) => {
    if (ts >= cutoff && ts <= now) newInWindow++;
  });

  return days > 0 ? newInWindow / days : 0;
}

/**
 * Estimate finish date given remaining sections and velocity.
 */
export function calcEstimatedFinish(remaining: number, velocity: number): Date | null {
  if (velocity <= 0 || remaining <= 0) return remaining <= 0 ? new Date() : null;
  const daysNeeded = Math.ceil(remaining / velocity);
  return addDays(new Date(), daysNeeded);
}

export type PlannerStatus = "green" | "yellow" | "red" | "no-goal";

/**
 * Compare estimated finish to goal date.
 */
export function getPlannerStatus(estimatedFinish: Date | null, goalDateStr: string | null): { status: PlannerStatus; daysLate: number } {
  if (!goalDateStr || !estimatedFinish) return { status: "no-goal", daysLate: 0 };
  const goal = new Date(goalDateStr);
  const diff = differenceInDays(estimatedFinish, goal);
  if (diff <= 0) return { status: "green", daysLate: 0 };
  if (diff < 14) return { status: "yellow", daysLate: diff };
  return { status: "red", daysLate: diff };
}

/**
 * Suggested new cards for today to stay on track.
 */
export function getDailySuggestion(
  totalSections: number,
  learnedSections: number,
  goalDateStr: string | null,
  velocity: number
): { suggestedToday: number; message: string } | null {
  if (!goalDateStr) return null;
  const goal = new Date(goalDateStr);
  const remaining = totalSections - learnedSections;
  if (remaining <= 0) return { suggestedToday: 0, message: "Sve cjeline su naučene! 🎉" };
  const daysLeft = Math.max(1, differenceInDays(goal, new Date()));
  const needed = Math.ceil(remaining / daysLeft);
  return {
    suggestedToday: needed,
    message: `Obradi bar ${needed} novih cjelina danas da ostaneš na planu.`,
  };
}

/**
 * Build cumulative progress data for charting.
 */
export function buildProgressCurve(
  reviewLog: ReviewLogEntry[],
  totalSections: number,
  goalDateStr: string | null,
  planStartDate: number
): { planned: { date: string; value: number }[]; actual: { date: string; value: number }[] } {
  // Actual curve: cumulative new sections per day
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach((e) => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });

  const dailyCounts = new Map<string, number>();
  sectionFirstSeen.forEach((ts) => {
    const dayKey = new Date(ts).toISOString().slice(0, 10);
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + 1);
  });

  // Sort days and build cumulative
  const sortedDays = Array.from(dailyCounts.keys()).sort();
  const actual: { date: string; value: number }[] = [];
  let cumulative = 0;
  sortedDays.forEach((day) => {
    cumulative += dailyCounts.get(day) || 0;
    actual.push({ date: day, value: cumulative });
  });

  // Planned curve: linear from start to goal
  const planned: { date: string; value: number }[] = [];
  if (goalDateStr) {
    const start = new Date(planStartDate);
    const goal = new Date(goalDateStr);
    const totalDays = Math.max(1, differenceInDays(goal, start));
    const step = totalSections / totalDays;

    // Generate points for each week or every few days (max 60 points)
    const interval = Math.max(1, Math.floor(totalDays / 60));
    for (let i = 0; i <= totalDays; i += interval) {
      const d = addDays(start, i);
      planned.push({ date: d.toISOString().slice(0, 10), value: Math.round(step * i) });
    }
    // Ensure final point
    planned.push({ date: goalDateStr, value: totalSections });
  }

  return { planned, actual };
}
