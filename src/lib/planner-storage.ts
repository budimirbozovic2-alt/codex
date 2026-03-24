import { Card } from "./spaced-repetition";
import { ReviewLogEntry } from "./storage";
import { db } from "./db";
import { addDays, differenceInDays, startOfDay } from "date-fns";

const PLANNER_KEY = "sr-planner-config";
const DISCIPLINE_KEY = "sr-discipline-log";

// ─── IDB→localStorage hydration for planner data ────────
export async function hydratePlannerFromIDB(): Promise<void> {
  try {
    const [disciplineLog, plannerConfig] = await Promise.all([
      db.disciplineLog.toArray(),
      db.settings.get("plannerConfig"),
    ]);
    if (!localStorage.getItem(DISCIPLINE_KEY) && disciplineLog.length > 0)
      localStorage.setItem(DISCIPLINE_KEY, JSON.stringify(disciplineLog));
    if (!localStorage.getItem(PLANNER_KEY) && plannerConfig?.value)
      localStorage.setItem(PLANNER_KEY, JSON.stringify(plannerConfig.value));
  } catch (err) {
    console.warn("[hydrate] planner IDB→localStorage hydration failed", err);
  }
}

// ─── Types ───────────────────────────────────────────────

export interface StudyPhase {
  id: string;
  name: string;
  expectedDays: number;
  categories: string[];
}

/** @deprecated kept for migration */
export interface StudyDecade {
  id: string;
  name: string;
  durationDays: number;
  categories: string[];
  startDate: string;
}

export interface PlannerConfig {
  phases: StudyPhase[];
  finalGoalDate: string | null;
  createdAt: number;
  bufferPercent: number;
  /** @deprecated migrated to phases */
  decades?: StudyDecade[];
}

const DEFAULT_CONFIG: PlannerConfig = {
  phases: [],
  finalGoalDate: null,
  createdAt: Date.now(),
  bufferPercent: 15,
};

// ─── Persistence ─────────────────────────────────────────

export function loadPlanner(): PlannerConfig {
  try {
    const data = localStorage.getItem(PLANNER_KEY);
    if (!data) return { ...DEFAULT_CONFIG, createdAt: Date.now() };
    const parsed = JSON.parse(data);
    // Migrate old decades → phases
    if (parsed.decades && !parsed.phases) {
      parsed.phases = (parsed.decades as StudyDecade[]).map((d) => ({
        id: d.id,
        name: d.name,
        expectedDays: d.durationDays,
        categories: d.categories,
      }));
      delete parsed.decades;
    }
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG, createdAt: Date.now() };
  }
}

export function savePlanner(config: PlannerConfig): void {
  try { localStorage.setItem(PLANNER_KEY, JSON.stringify(config)); } catch {}
  db.settings.put({ key: "plannerConfig", value: config }).catch(() => {});
}

// ─── Velocity ────────────────────────────────────────────

export function calcVelocity(reviewLog: ReviewLogEntry[], days: number = 7): number {
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

// ─── Phase Progress ──────────────────────────────────────

export interface PhaseProgress {
  phase: StudyPhase;
  total: number;
  learned: number;
  pct: number;
  remainingCards: number;
}

export function calcPhaseProgress(phase: StudyPhase, cards: Card[]): PhaseProgress {
  const relevant = phase.categories.length > 0
    ? cards.filter(c => phase.categories.includes(c.category))
    : cards;
  const total = relevant.reduce((s, c) => s + c.sections.length, 0);
  let learned = 0;
  relevant.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) learned++; }));
  return { phase, total, learned, pct: total > 0 ? Math.round((learned / total) * 100) : 0, remainingCards: total - learned };
}

/** Dynamic phase dates based on velocity */
export function calcDynamicPhaseDates(
  phases: StudyPhase[], cards: Card[], velocity: number
): { phaseId: string; startDate: Date; endDate: Date; dynamicDays: number }[] {
  const result: { phaseId: string; startDate: Date; endDate: Date; dynamicDays: number }[] = [];
  let cursor = new Date();
  for (const phase of phases) {
    const { remainingCards } = calcPhaseProgress(phase, cards);
    const dynamicDays = velocity > 0 ? Math.max(1, Math.ceil(remainingCards / velocity)) : phase.expectedDays;
    const startDate = new Date(cursor);
    const endDate = addDays(cursor, dynamicDays);
    result.push({ phaseId: phase.id, startDate, endDate, dynamicDays });
    cursor = endDate;
  }
  return result;
}

// ─── Smart Load Balancing ────────────────────────────────

export interface SmartSuggestion {
  suggestedToday: number;
  message: string;
  burnoutWarning: boolean;
}

export function getSmartSuggestion(
  phase: StudyPhase | null, cards: Card[], goalDateStr: string | null, velocity: number, bufferPct: number
): SmartSuggestion | null {
  if (!goalDateStr) return null;
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const daysLeft = Math.max(1, differenceInDays(effectiveGoal, new Date()));

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

// ─── Re-balance (distribute debt) ────────────────────────

export function calcRebalancedQuota(
  totalRemaining: number, goalDateStr: string | null, bufferPct: number
): { newDailyQuota: number; daysLeft: number } | null {
  if (!goalDateStr) return null;
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const daysLeft = Math.max(1, differenceInDays(effectiveGoal, new Date()));
  return { newDailyQuota: Math.ceil(totalRemaining / daysLeft), daysLeft };
}

// ─── Estimated Finish & Status ───────────────────────────

export function calcEstimatedFinish(remaining: number, velocity: number): Date | null {
  if (velocity <= 0 || remaining <= 0) return remaining <= 0 ? new Date() : null;
  return addDays(new Date(), Math.ceil(remaining / velocity));
}

export type PlannerStatus = "green" | "yellow" | "red" | "no-goal";

export function getPlannerStatus(
  estimatedFinish: Date | null, goalDateStr: string | null, bufferPct: number = 0
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

// ─── Burn-up Chart Data ──────────────────────────────────

export function buildBurnupData(
  reviewLog: ReviewLogEntry[], totalSections: number, goalDateStr: string | null, bufferPct: number
): { date: string; ideal: number | null; actual: number | null }[] {
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach((e) => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });

  // Build actual cumulative
  const dailyCounts = new Map<string, number>();
  sectionFirstSeen.forEach((ts) => {
    const dayKey = new Date(ts).toISOString().slice(0, 10);
    dailyCounts.set(dayKey, (dailyCounts.get(dayKey) || 0) + 1);
  });

  const sortedActualDays = Array.from(dailyCounts.keys()).sort();
  const actualMap = new Map<string, number>();
  let cum = 0;
  sortedActualDays.forEach(day => { cum += dailyCounts.get(day)!; actualMap.set(day, cum); });

  // Build ideal line
  const idealMap = new Map<string, number>();
  if (goalDateStr && sortedActualDays.length > 0) {
    const startDate = new Date(sortedActualDays[0]);
    const goal = new Date(goalDateStr);
    const bufferDays = Math.round(differenceInDays(goal, startDate) * (bufferPct / 100));
    const effectiveGoal = addDays(goal, -bufferDays);
    const totalDays = Math.max(1, differenceInDays(effectiveGoal, startDate));
    const step = totalSections / totalDays;
    const interval = Math.max(1, Math.floor(totalDays / 80));
    for (let i = 0; i <= totalDays; i += interval) {
      const d = addDays(startDate, i);
      idealMap.set(d.toISOString().slice(0, 10), Math.round(step * i));
    }
    idealMap.set(effectiveGoal.toISOString().slice(0, 10), totalSections);
  }

  const allDates = new Set([...actualMap.keys(), ...idealMap.keys()]);
  const sorted = Array.from(allDates).sort();
  let lastActual = 0, lastIdeal = 0;
  return sorted.map(date => {
    if (actualMap.has(date)) lastActual = actualMap.get(date)!;
    if (idealMap.has(date)) lastIdeal = idealMap.get(date)!;
    return {
      date,
      actual: actualMap.has(date) ? lastActual : null,
      ideal: idealMap.has(date) ? lastIdeal : null,
    };
  });
}

// ─── Simulation Projection ───────────────────────────────

export function getProjectionText(
  velocity: number, remaining: number, goalDateStr: string | null, bufferPct: number
): string {
  if (velocity <= 0) return "Nema dovoljno podataka za projekciju. Nastavi sa učenjem.";
  const finish = calcEstimatedFinish(remaining, velocity);
  if (!finish) return "Sve cjeline su savladane!";
  if (!goalDateStr) return `Sa trenutnim tempom, završićeš bazu dana ${finish.toLocaleDateString("sr-Latn")}.`;
  const goal = new Date(goalDateStr);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (bufferPct / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const diff = differenceInDays(finish, effectiveGoal);
  if (diff <= 0) {
    return `Sa tvojim trenutnim tempom (zadnjih 7 dana), završićeš bazu dana ${finish.toLocaleDateString("sr-Latn")}. To je ${Math.abs(diff)} dana prije tvog cilja.`;
  }
  return `Sa tvojim trenutnim tempom (zadnjih 7 dana), završićeš bazu dana ${finish.toLocaleDateString("sr-Latn")}. To je ${diff} dana poslije tvog cilja.`;
}

// ─── Daily Time Predictor ────────────────────────────────

export function calcDailyTimeRecommendation(
  suggestedSections: number, velocity: number, dueCount: number, avgMinPerSection: number = 3
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

export function loadDisciplineLog(): DisciplineEntry[] {
  try {
    const data = localStorage.getItem(DISCIPLINE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

export function saveDisciplineLog(log: DisciplineEntry[]) {
  try { localStorage.setItem(DISCIPLINE_KEY, JSON.stringify(log)); } catch {}
  db.disciplineLog.clear().then(() => {
    if (log.length > 0) db.disciplineLog.bulkAdd(log).catch(() => {});
  }).catch(() => {});
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

export function recordDayDiscipline(
  date: string, reviewsDone: number, dailyGoal: number, slippageMs: number | null
): DisciplineEntry {
  const status = calcDisciplineStatus(reviewsDone, dailyGoal, slippageMs);
  const completion = dailyGoal > 0 ? Math.round((reviewsDone / dailyGoal) * 100) : 0;
  const entry: DisciplineEntry = { date, status, planCompletion: completion, slippageMs, reviewsDone, suggestedReviews: dailyGoal };
  const log = loadDisciplineLog();
  const idx = log.findIndex(e => e.date === date);
  if (idx >= 0) log[idx] = entry; else log.push(entry);
  saveDisciplineLog(log);
  return entry;
}

export function getCognitiveDebt(dailyGoal: number): { hasDebt: boolean; debtCards: number; message: string } | null {
  const log = loadDisciplineLog();
  const yesterday = addDays(new Date(), -1).toISOString().slice(0, 10);
  const entry = log.find(e => e.date === yesterday);
  if (!entry || entry.status !== "lazy") return null;
  const debtCards = Math.max(0, entry.suggestedReviews - entry.reviewsDone);
  if (debtCards <= 0) return null;
  return { hasDebt: true, debtCards, message: `Dug iz prethodnog dana: ${debtCards} kartica. Danas je potreban pojačan napor.` };
}

export function getDisciplineTrend(days: number = 30): { date: string; diligentPct: number }[] {
  const log = loadDisciplineLog();
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

/** Phase-specific discipline percentage */
export function getPhaseDisciplinePct(disciplineLog: DisciplineEntry[]): number {
  if (disciplineLog.length === 0) return 0;
  const recent = disciplineLog.slice(-14);
  const diligent = recent.filter(e => e.status === "diligent").length;
  return Math.round((diligent / recent.length) * 100);
}

// ─── Daily Mapping Tracker (Auto-sync) ──────────────────

const DAILY_MAPPED_KEY = "sr-daily-mapped";

interface DailyMapped {
  date: string;
  count: number;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyMappedCount(): number {
  try {
    const data = localStorage.getItem(DAILY_MAPPED_KEY);
    if (!data) return 0;
    const parsed: DailyMapped = JSON.parse(data);
    return parsed.date === getTodayKey() ? parsed.count : 0;
  } catch { return 0; }
}

export function incrementDailyMapped(amount: number = 1): number {
  const today = getTodayKey();
  const current = getDailyMappedCount();
  const newCount = current + amount;
  try {
    localStorage.setItem(DAILY_MAPPED_KEY, JSON.stringify({ date: today, count: newCount }));
  } catch {}
  return newCount;
}

// ─── Auto-Redistribute (midnight check) ─────────────────

export function autoRedistributeIfNeeded(
  cards: Card[], goalDateStr: string | null, bufferPct: number
): { redistributed: boolean; newQuota: number } | null {
  if (!goalDateStr) return null;
  const today = getTodayKey();
  const REDIS_KEY = "sr-last-redistribute";
  try {
    const last = localStorage.getItem(REDIS_KEY);
    if (last === today) return null; // already done today
  } catch {}

  // Check if yesterday had unmet quota
  const log = loadDisciplineLog();
  const yesterday = addDays(new Date(), -1).toISOString().slice(0, 10);
  const entry = log.find(e => e.date === yesterday);
  if (!entry || entry.planCompletion >= 90) {
    // No debt or quota was met
    try { localStorage.setItem(REDIS_KEY, today); } catch {}
    return null;
  }

  // Redistribute
  let total = 0, learned = 0;
  cards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
  const remaining = total - learned;
  const result = calcRebalancedQuota(remaining, goalDateStr, bufferPct);
  if (!result) return null;

  try { localStorage.setItem(REDIS_KEY, today); } catch {}
  return { redistributed: true, newQuota: result.newDailyQuota };
}

// ─── Phase-aware daily progress ─────────────────────────

export interface DailyPhaseProgress {
  phaseName: string;
  phaseTotal: number;
  phaseLearned: number;
  phasePct: number;
  dailyQuota: number;
  dailyDone: number;
  dailyPct: number;
}
