/**
 * Discipline recording after learn/review sessions.
 *
 * `reviewsDone` = unique card:section pairs worked today (log + current
 * session), aligned with velocity's per-section semantics — not raw log rows.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { loadPlanner } from "./config";
import { getSmartSuggestion } from "./suggestions";

export function sectionReviewKey(cardId: string, sectionId: string): string {
  return `${cardId}:${sectionId}`;
}

export function todayDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Unique sections with at least one review log entry on `dateKey`. */
export function countUniqueSectionsOnDate(
  reviewLog: ReviewLogEntry[],
  dateKey: string,
  extraKeys?: ReadonlySet<string>,
): number {
  const seen = new Set<string>();
  for (const e of reviewLog) {
    if (new Date(e.timestamp).toISOString().slice(0, 10) === dateKey) {
      seen.add(sectionReviewKey(e.cardId, e.sectionId));
    }
  }
  if (extraKeys) {
    for (const k of extraKeys) seen.add(k);
  }
  return seen.size;
}

export function resolveDailyDisciplineGoal(cards: Card[]): number {
  const config = loadPlanner();
  const suggestion = getSmartSuggestion(
    null,
    cards,
    config.finalGoalDate,
    config.bufferPercent,
    config.dailyQuotaOverride,
  );
  return suggestion?.suggestedToday ?? 0;
}

export interface SessionDisciplineInput {
  reviewLog: ReviewLogEntry[];
  cards: Card[];
  sessionSectionKeys: ReadonlySet<string>;
  slippageMs?: number | null;
}

export function buildSessionDisciplinePayload({
  reviewLog,
  cards,
  sessionSectionKeys,
  slippageMs = null,
}: SessionDisciplineInput): {
  date: string;
  reviewsDone: number;
  dailyGoal: number;
  slippageMs: number | null;
} {
  const date = todayDateKey();
  return {
    date,
    reviewsDone: countUniqueSectionsOnDate(reviewLog, date, sessionSectionKeys),
    dailyGoal: resolveDailyDisciplineGoal(cards),
    slippageMs,
  };
}
