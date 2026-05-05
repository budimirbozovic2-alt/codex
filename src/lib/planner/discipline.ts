/** Discipline log: sync read, serialized write, classification, debt + trend. */
import { addDays } from "date-fns";
import { db } from "../db";
import { disciplineCache, enqueueWrite } from "./cache";
import type { DisciplineEntry, DisciplineStatus } from "./types";

export function loadDisciplineLog(): DisciplineEntry[] {
  return disciplineCache.get();
}

export function saveDisciplineLog(log: DisciplineEntry[]) {
  disciplineCache.set(log);
  enqueueWrite("saveDisciplineLog", () =>
    db.transaction("rw", db.disciplineLog, async () => {
      await db.disciplineLog.clear();
      if (log.length > 0) await db.disciplineLog.bulkAdd(log);
    }),
  );
}

export function calcDisciplineStatus(
  reviewsDone: number, dailyGoal: number, slippageMs: number | null,
): DisciplineStatus {
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
  date: string, reviewsDone: number, dailyGoal: number, slippageMs: number | null,
): DisciplineEntry {
  const status = calcDisciplineStatus(reviewsDone, dailyGoal, slippageMs);
  const completion = dailyGoal > 0 ? Math.round((reviewsDone / dailyGoal) * 100) : 0;
  const entry: DisciplineEntry = { date, status, planCompletion: completion, slippageMs, reviewsDone, suggestedReviews: dailyGoal };
  const log = [...disciplineCache.get()];
  const idx = log.findIndex(e => e.date === date);
  if (idx >= 0) log[idx] = entry; else log.push(entry);
  saveDisciplineLog(log);
  return entry;
}

export function getCognitiveDebt(
  dailyGoal: number,
): { hasDebt: boolean; debtCards: number; message: string } | null {
  void dailyGoal;
  const yesterday = addDays(new Date(), -1).toISOString().slice(0, 10);
  const entry = disciplineCache.get().find(e => e.date === yesterday);
  if (!entry || entry.status !== "lazy") return null;
  const debtCards = Math.max(0, entry.suggestedReviews - entry.reviewsDone);
  if (debtCards <= 0) return null;
  return { hasDebt: true, debtCards, message: `Dug iz prethodnog dana: ${debtCards} kartica. Danas je potreban pojačan napor.` };
}

export function getDisciplineTrend(days: number = 30): { date: string; diligentPct: number }[] {
  const cache = disciplineCache.get();
  if (cache.length === 0) return [];
  const sorted = [...cache].sort((a, b) => a.date.localeCompare(b.date));
  const result: { date: string; diligentPct: number }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const windowStart = Math.max(0, i - 6);
    const window = sorted.slice(windowStart, i + 1);
    const diligent = window.filter(e => e.status === "diligent").length;
    result.push({ date: sorted[i].date, diligentPct: Math.round((diligent / window.length) * 100) });
  }
  return result.slice(-days);
}
