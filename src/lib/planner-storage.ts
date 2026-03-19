import { Card } from "./spaced-repetition";
import { ReviewLogEntry } from "./storage";
import { addDays, differenceInDays, startOfDay } from "date-fns";

const PLANNER_KEY = "sr-planner-config";
const DISCIPLINE_KEY = "sr-discipline-log";

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

// ─── Daily Time Predictor ────────────────────────────────

/** Average minutes per section based on review log timing */
export function calcAvgMinutesPerSection(reviewLog: ReviewLogEntry[]): number {
  // Estimate: group reviews by day and count sections done per day
  // Then use total active minutes from activity log or estimate ~3 min per review action
  const AVG_MINUTES_PER_SECTION = 3; // conservative estimate
  return AVG_MINUTES_PER_SECTION;
}

export function calcDailyTimeRecommendation(
  suggestedSections: number,
  velocity: number,
  dueCount: number,
  avgMinPerSection: number = 3
): { totalMinutes: number; hours: number; minutes: number; message: string } {
  const totalSections = suggestedSections + dueCount;
  const totalMinutes = Math.round(totalSections * avgMinPerSection);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const message = hours > 0
    ? `${hours}h ${minutes}min efektivnog učenja`
    : `${minutes} min efektivnog učenja`;
  return { totalMinutes, hours, minutes, message };
}

// ─── Discipline Tracker ──────────────────────────────────

export type DisciplineStatus = "diligent" | "neutral" | "lazy";

export interface DisciplineEntry {
  date: string; // YYYY-MM-DD
  status: DisciplineStatus;
  planCompletion: number; // 0-100%
  slippageMs: number | null;
  reviewsDone: number;
  suggestedReviews: number;
}

export function loadDisciplineLog(): DisciplineEntry[] {
  try {
    const data = localStorage.getItem(DISCIPLINE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveDisciplineLog(log: DisciplineEntry[]) {
  localStorage.setItem(DISCIPLINE_KEY, JSON.stringify(log));
}

export function calcDisciplineStatus(
  reviewsDone: number,
  dailyGoal: number,
  slippageMs: number | null
): DisciplineStatus {
  if (dailyGoal === 0) return "neutral";
  const completion = (reviewsDone / dailyGoal) * 100;
  const lowSlippage = slippageMs === null || slippageMs < 5 * 60 * 1000; // < 5 min
  if (completion >= 90 && lowSlippage) return "diligent";
  if (completion >= 70) return "neutral";
  return "lazy";
}

export function getDisciplineEmoji(status: DisciplineStatus): string {
  switch (status) {
    case "diligent": return "🚀";
    case "neutral": return "😐";
    case "lazy": return "🐢";
  }
}

export function getDisciplineLabel(status: DisciplineStatus): string {
  switch (status) {
    case "diligent": return "Vrijedan";
    case "neutral": return "Neutralan";
    case "lazy": return "Lijen";
  }
}

/**
 * Record discipline for a given day. Called when checking dashboard.
 */
export function recordDayDiscipline(
  date: string,
  reviewsDone: number,
  dailyGoal: number,
  slippageMs: number | null
): DisciplineEntry {
  const status = calcDisciplineStatus(reviewsDone, dailyGoal, slippageMs);
  const completion = dailyGoal > 0 ? Math.round((reviewsDone / dailyGoal) * 100) : 0;
  const entry: DisciplineEntry = {
    date,
    status,
    planCompletion: completion,
    slippageMs,
    reviewsDone,
    suggestedReviews: dailyGoal,
  };

  const log = loadDisciplineLog();
  const idx = log.findIndex(e => e.date === date);
  if (idx >= 0) log[idx] = entry; else log.push(entry);
  saveDisciplineLog(log);
  return entry;
}

/**
 * Get cognitive debt from yesterday if it was a "lazy" day.
 */
export function getCognitiveDebt(dailyGoal: number): { hasDebt: boolean; debtCards: number; message: string } | null {
  const log = loadDisciplineLog();
  const yesterday = addDays(new Date(), -1).toISOString().slice(0, 10);
  const entry = log.find(e => e.date === yesterday);
  if (!entry || entry.status !== "lazy") return null;
  const debtCards = Math.max(0, entry.suggestedReviews - entry.reviewsDone);
  if (debtCards <= 0) return null;
  return {
    hasDebt: true,
    debtCards,
    message: `Dug iz prethodnog dana: ${debtCards} kartica. Danas je potreban pojačan napor.`,
  };
}

/**
 * Get discipline trend data for charting (% of diligent days).
 */
export function getDisciplineTrend(days: number = 30): { date: string; diligentPct: number }[] {
  const log = loadDisciplineLog();
  if (log.length === 0) return [];

  // Rolling 7-day window
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const result: { date: string; diligentPct: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - 6);
    const window = sorted.slice(windowStart, i + 1);
    const diligent = window.filter(e => e.status === "diligent").length;
    result.push({
      date: sorted[i].date,
      diligentPct: Math.round((diligent / window.length) * 100),
    });
  }

  return result.slice(-days);
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

  const sortedDays = Array.from(dailyCounts.keys()).sort();
  const actual: { date: string; value: number }[] = [];
  let cumulative = 0;
  sortedDays.forEach((day) => {
    cumulative += dailyCounts.get(day) || 0;
    actual.push({ date: day, value: cumulative });
  });

  const planned: { date: string; value: number }[] = [];
  if (goalDateStr) {
    const start = new Date(planStartDate);
    const goal = new Date(goalDateStr);
    const totalDays = Math.max(1, differenceInDays(goal, start));
    const step = totalSections / totalDays;

    const interval = Math.max(1, Math.floor(totalDays / 60));
    for (let i = 0; i <= totalDays; i += interval) {
      const d = addDays(start, i);
      planned.push({ date: d.toISOString().slice(0, 10), value: Math.round(step * i) });
    }
    planned.push({ date: goalDateStr, value: totalSections });
  }

  return { planned, actual };
}
