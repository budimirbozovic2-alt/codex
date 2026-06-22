/** Daily-mapped counter + midnight auto-redistribute.
 *
 * NOTE: `incrementDailyMapped` tracks Source Reader mapping activity only.
 * Planner/dashboard daily progress uses `countDailyLearnProgress` (review log).
 */
import { addDays } from "date-fns";
import type { Card } from "@/lib/spaced-repetition";
import {
  dailyMappedCache,
  disciplineCache,
  lastRedistributeCache,
} from "./cache";
import { loadPlanner, savePlanner } from "./config";
import { saveDailyMapped, saveLastRedistribute } from "@/lib/db/queries";
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
  void saveDailyMapped({ ...next });
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
    void saveLastRedistribute(today);
    return null;
  }

  let total = 0, learned = 0;
  cards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
  const remaining = total - learned;
  const result = calcRebalancedQuota(remaining, goalDateStr, bufferPct);
  if (!result) return null;

  // Persist the rebalanced quota so the next planner/dashboard render is consistent.
  const config = loadPlanner();
  if (config.dailyQuotaOverride !== result.newDailyQuota) {
    void savePlanner({ ...config, dailyQuotaOverride: result.newDailyQuota }).catch(() => {
      /* quota persist is best-effort during auto-redistribute */
    });
  }

  lastRedistributeCache.set(today);
  void saveLastRedistribute(today);
  return { redistributed: true, newQuota: result.newDailyQuota };
}
