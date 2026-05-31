/** Burn-up chart data builder (actual cumulative + ideal projection). */
import { addDays, differenceInDays } from "date-fns";
import type { ReviewLogEntry } from "../storage";

export function buildBurnupData(
  reviewLog: ReviewLogEntry[], totalSections: number, goalDateStr: string | null, bufferPct: number,
): { date: string; ideal: number | null; actual: number | null }[] {
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

  const sortedActualDays = Array.from(dailyCounts.keys()).sort();
  const actualMap = new Map<string, number>();
  let cum = 0;
  sortedActualDays.forEach(day => { cum += dailyCounts.get(day)!; actualMap.set(day, cum); });

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
