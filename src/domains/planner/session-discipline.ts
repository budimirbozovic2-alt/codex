/**
 * Discipline recording after learn/review sessions.
 *
 * `reviewsDone` = unique card:section pairs worked today (log + current
 * session), aligned with velocity's per-section semantics — not raw log rows.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import type { CategoryRecord } from "@/lib/db-types";
import type { SubjectPlan } from "@/types/planner";
import { loadPlanner } from "./config";
import { generateStudyPlan } from "./plan-generator";
import { getSmartSuggestion } from "./suggestions";
import { resolveActiveSubjectPlan } from "@/lib/dashboard/active-phase";

export function sectionReviewKey(cardId: string, sectionId: string): string {
  return `${cardId}:${sectionId}`;
}

export function todayDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Count sections whose *first-ever* review happened today.
 *
 * This is used as the planner/dashboard "daily progress" metric.
 */
export function countDailyLearnProgress(
  reviewLog: ReviewLogEntry[],
  todayKey: string = todayDateKey(),
): number {
  const firstSeenTsBySection = new Map<string, number>();
  for (const e of reviewLog) {
    const key = sectionReviewKey(e.cardId, e.sectionId);
    const prev = firstSeenTsBySection.get(key);
    if (prev === undefined || e.timestamp < prev) firstSeenTsBySection.set(key, e.timestamp);
  }

  let count = 0;
  for (const ts of firstSeenTsBySection.values()) {
    if (new Date(ts).toISOString().slice(0, 10) === todayKey) count++;
  }
  return count;
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

export function resolveDailyDisciplineGoal(
  cards: Card[],
  categoryRecords: CategoryRecord[] = [],
  activePlan: SubjectPlan | null = null,
): number {
  const config = loadPlanner();
  if (!config.finalGoalDate) return 0;
  const plan = activePlan ?? (
    categoryRecords.length > 0
      ? resolveActiveSubjectPlan(generateStudyPlan(config, categoryRecords, cards))
      : null
  );
  const suggestion = getSmartSuggestion(
    plan,
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
