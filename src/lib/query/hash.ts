/**
 * Stable hash utilities for TanStack query keys.
 *
 * PR-H7 Hardening: Fixed O(N) loop syntax, extracted
 * inline types, and enforced Safe-Paste compliance.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";

export function hashCards(cards: Card[]): string {
  if (cards.length === 0) return "empty";
  
  // PR-H7 Optimization: Optimized standard loops 
  // to avoid iterator allocations over large arrays.
  let sections = 0;
  let maxLast = 0;
  const len = cards.length;
  
  for (let i = 0; i < len; i++) {
    const c = cards[i];
    const sLen = c.sections.length;
    sections += sLen;
    for (let j = 0; j < sLen; j++) {
      const s = c.sections[j];
      if (s.lastReviewed && s.lastReviewed > maxLast) {
        maxLast = s.lastReviewed;
      }
    }
  }
  return `${len}:${sections}:${maxLast}`;
}

export function hashCategories(records: CategoryRecord[]): string {
  if (records.length === 0) return "empty";
  return records
    .map((r) => r.id)
    .sort()
    .join("|");
}

interface PlannerConfigInput {
  dailyAvailableMinutes: number;
  finalGoalDate?: string | null;
  bufferPercent: number;
}

export function hashPlannerConfig(
  cfg: PlannerConfigInput
): string {
  const goal = cfg.finalGoalDate ?? "";
  return `${cfg.dailyAvailableMinutes}:${goal}:${cfg.bufferPercent}`;
}