import { Card } from "./spaced-repetition";
import { ReviewLogEntry } from "./storage";
import { db } from "./db";
import { addDays, differenceInDays, startOfDay } from "date-fns";

export interface StudyDecade {
  id: string;
  name: string;
  durationDays: number;
  categories: string[];
  startDate: string;
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

// Sync fallback for legacy callers that need immediate data
export function loadPlanner(): PlannerConfig {
  try {
    const data = localStorage.getItem("sr-planner-config");
    return data ? { ...DEFAULT_CONFIG, ...JSON.parse(data) } : { ...DEFAULT_CONFIG, createdAt: Date.now() };
  } catch {
    return { ...DEFAULT_CONFIG, createdAt: Date.now() };
  }
}

export async function loadPlannerAsync(): Promise<PlannerConfig> {
  const row = await db.settings.get("plannerConfig");
  return row ? { ...DEFAULT_CONFIG, ...row.value } : loadPlanner();
}

export async function savePlanner(config: PlannerConfig): Promise<void> {
  await db.settings.put({ key: "plannerConfig", value: config });
  // Keep localStorage as fast cache
  try { localStorage.setItem("sr-planner-config", JSON.stringify(config)); } catch {}
}

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

export function calcEstimatedFinish(remaining: number, velocity: number): Date | null {
  if (velocity <= 0 || remaining <= 0) return remaining <= 0 ? new Date() : null;
  const daysNeeded = Math.ceil(remaining / velocity);
  return addDays(new Date(), daysNeeded);
}

export type PlannerStatus = "green" | "yellow" | "red" | "no-goal";

export function getPlannerStatus(estimatedFinish: Date | null, goalDateStr: string | null): { status: PlannerStatus; daysLate: number } {
  if (!goalDateStr || !estimatedFinish) return { status: "no-goal", daysLate: 0 };
  const goal = new Date(goalDateStr);
  const diff = differenceInDays(estimatedFinish, goal);
  if (diff <= 0) return { status: "green", daysLate: 0 };
  if (diff < 14) return { status: "yellow", daysLate: diff };
  return { status: "red", daysLate: diff };
}

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
  return { suggestedToday: needed, message: `Obradi bar ${needed} novih cjelina danas da ostaneš na planu.` };
}

// ─── Daily Time Predictor ────────────────────────────────

export function calcAvgMinutesPerSection(reviewLog: ReviewLogEntry[]): number {
  const AVG_MINUTES_PER_SECTION = 3;
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
  const message = hours > 0 ? `${hours}h ${minutes}min efektivnog učenja` : `${minutes} min efektivnog učenja`;
  return { totalMinutes, hours, minutes, message };
}

// ─── Discipline Tracker ──────────────────────────────────

export type DisciplineStatus = "diligent" | "neutral" | "lazy";

export interface DisciplineEntry {
  date: string;
  status: DisciplineStatus;
  planCompletion: number;
  slippageMs: number | null;
  reviewsDone: number;
  suggestedReviews: number;
}

export async function loadDisciplineLog(): Promise<DisciplineEntry[]> {
  return db.disciplineLog.toArray();
}

export async function saveDisciplineLog(log: DisciplineEntry[]) {
  await db.disciplineLog.clear();
  if (log.length > 0) await db.disciplineLog.bulkAdd(log);
}

export function calcDisciplineStatus(reviewsDone: number, dailyGoal: number, slippageMs: number | null): DisciplineStatus {
  if (dailyGoal === 0) return "neutral";
  const completion = (reviewsDone / dailyGoal) * 100;
  const lowSlippage = slippageMs === null || slippageMs < 5 * 60 * 1000;
  if (completion >= 90 && lowSlippage) return "diligent";
  if (completion >= 70) return "neutral";
  return "lazy";
}

export function getDisciplineEmoji(status: DisciplineStatus): string {
  switch (status) { case "diligent": return "🚀"; case "neutral": return "😐"; case "lazy": return "🐢"; }
}

export function getDisciplineLabel(status: DisciplineStatus): string {
  switch (status) { case "diligent": return "Vrijedan"; case "neutral": return "Neutralan"; case "lazy": return "Lijen"; }
}

export async function recordDayDiscipline(
  date: string, reviewsDone: number, dailyGoal: number, slippageMs: number | null
): Promise<DisciplineEntry> {
  const status = calcDisciplineStatus(reviewsDone, dailyGoal, slippageMs);
  const completion = dailyGoal > 0 ? Math.round((reviewsDone / dailyGoal) * 100) : 0;
  const entry: DisciplineEntry = { date, status, planCompletion: completion, slippageMs, reviewsDone, suggestedReviews: dailyGoal };

  const log = await loadDisciplineLog();
  const idx = log.findIndex(e => e.date === date);
  if (idx >= 0) log[idx] = entry; else log.push(entry);
  await saveDisciplineLog(log);
  return entry;
}

export async function getCognitiveDebt(dailyGoal: number): Promise<{ hasDebt: boolean; debtCards: number; message: string } | null> {
  const log = await loadDisciplineLog();
  const yesterday = addDays(new Date(), -1).toISOString().slice(0, 10);
  const entry = log.find(e => e.date === yesterday);
  if (!entry || entry.status !== "lazy") return null;
  const debtCards = Math.max(0, entry.suggestedReviews - entry.reviewsDone);
  if (debtCards <= 0) return null;
  return { hasDebt: true, debtCards, message: `Dug iz prethodnog dana: ${debtCards} kartica. Danas je potreban pojačan napor.` };
}

export async function getDisciplineTrend(days: number = 30): Promise<{ date: string; diligentPct: number }[]> {
  const log = await loadDisciplineLog();
  if (log.length === 0) return [];
  const sorted = [...log].sort((a, b) => a.date.localeCompare(b.date));
  const result: { date: string; diligentPct: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - 6);
    const window = sorted.slice(windowStart, i + 1);
    const diligent = window.filter(e => e.status === "diligent").length;
    result.push({ date: sorted[i].date, diligentPct: Math.round((diligent / window.length) * 100) });
  }
  return result.slice(-days);
}

export function buildProgressCurve(
  reviewLog: ReviewLogEntry[], totalSections: number, goalDateStr: string | null, planStartDate: number
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
