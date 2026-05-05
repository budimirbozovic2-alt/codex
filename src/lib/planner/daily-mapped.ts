/** Daily-mapped counter + midnight auto-redistribute. */
import { addDays } from "date-fns";
import { db } from "../db";
import type { Card } from "../spaced-repetition";
import {
  dailyMappedCache,
  disciplineCache,
  lastRedistributeCache,
  enqueueWrite,
} from "./cache";
import { calcRebalancedQuota } from "./suggestions";

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyMappedCount(): number {
  const slot = dailyMappedCache.get();
  return slot.date === getTodayKey() ? slot.count : 0;
}

export function incrementDailyMapped(amount: number = 1): number {
  const today = getTodayKey();
  const slot = dailyMappedCache.get();
  const current = slot.date === today ? slot.count : 0;
  const newCount = current + amount;
  const next = { date: today, count: newCount };
  dailyMappedCache.set(next);
  const snapshot = { ...next };
  enqueueWrite("incrementDailyMapped", () => db.settings.put({ key: "dailyMapped", value: snapshot }));
  return newCount;
}

export function autoRedistributeIfNeeded(
  cards: Card[], goalDateStr: string | null, bufferPct: number,
): { redistributed: boolean; newQuota: number } | null {
  if (!goalDateStr) return null;
  const today = getTodayKey();
  if (lastRedistributeCache.get() === today) return null;

  const yesterday = addDays(new Date(), -1).toISOString().slice(0, 10);
  const entry = disciplineCache.get().find(e => e.date === yesterday);
  if (!entry || entry.planCompletion >= 90) {
    lastRedistributeCache.set(today);
    enqueueWrite("lastRedistribute(skip)", () => db.settings.put({ key: "lastRedistribute", value: today }));
    return null;
  }

  let total = 0, learned = 0;
  cards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
  const remaining = total - learned;
  const result = calcRebalancedQuota(remaining, goalDateStr, bufferPct);
  if (!result) return null;

  lastRedistributeCache.set(today);
  enqueueWrite("lastRedistribute(apply)", () => db.settings.put({ key: "lastRedistribute", value: today }));
  return { redistributed: true, newQuota: result.newDailyQuota };
}
