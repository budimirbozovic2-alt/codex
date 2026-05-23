// Pure chart aggregators — heavy reduce/map loops used by MyStats.
// Moved out of `useStatsData` so the worker can run them off the main thread.
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { Card, SectionState, getSectionScore } from "../../spaced-repetition";
import type { ReviewLogEntry } from "../../storage";

export interface ActivityPoint {
  name: string;
  Ponavljanja: number;
  "Nove kartice": number;
}

export interface MasteryPoint { name: string; value: number }
export interface RatioPoint {
  name: string;
  "Stvarni ponavljanje": number | null;
  "Idealni cilj": number;
  [key: string]: string | number | null | undefined;
}

/** Local mastery-level scoring, duplicated from `@/lib/mastery` so this
 *  module stays free of the React-importing barrel. */
function masteryLevelPure(card: Card): number {
  if (!card.sections || card.sections.length === 0) return 0;
  const errorCount = card.errorLog?.reduce((sum, e) => sum + e.count, 0) || 0;
  const allNew = card.sections.every((s) => s.state === SectionState.New);
  if (allNew) return 0;
  const avgStability = card.sections.reduce((sum, s) => sum + s.stability, 0) / card.sections.length;
  if (errorCount > 3 || avgStability < 3) return 1;
  if (errorCount > 0 && avgStability < 7) return 2;
  const avgDifficulty = card.sections.reduce((sum, s) => sum + s.difficulty, 0) / card.sections.length;
  if (avgStability < 15 || avgDifficulty >= 6) return 3;
  if (avgStability <= 30) return 4;
  return 5;
}

export function buildActivityData(reviewLog: ReviewLogEntry[], cards: Card[]): ActivityPoint[] {
  const now = new Date();
  const days = eachDayOfInterval({ start: subDays(now, 13), end: now });

  const reviewByDay = new Map<string, number>();
  for (const r of reviewLog) {
    const key = format(new Date(r.timestamp), "dd.MM");
    reviewByDay.set(key, (reviewByDay.get(key) || 0) + 1);
  }
  const createdByDay = new Map<string, number>();
  for (const c of cards) {
    const key = format(new Date(c.createdAt), "dd.MM");
    createdByDay.set(key, (createdByDay.get(key) || 0) + 1);
  }

  return days.map((day) => {
    const key = format(day, "dd.MM");
    return { name: key, Ponavljanja: reviewByDay.get(key) || 0, "Nove kartice": createdByDay.get(key) || 0 };
  });
}

export function buildMasteryData(cards: Card[]): MasteryPoint[] {
  let novo = 0, ucenje = 0, napredno = 0, savladano = 0;
  cards.forEach((c) => {
    c.sections.forEach((s) => {
      const score = getSectionScore(s);
      if (score === 0) novo++;
      else if (score < 40) ucenje++;
      else if (score < 70) napredno++;
      else savladano++;
    });
  });
  return [
    { name: "Novo", value: novo },
    { name: "Učenje", value: ucenje },
    { name: "Napredno", value: napredno },
    { name: "Savladano", value: savladano },
  ].filter((d) => d.value > 0);
}

export function buildRatioHistory(reviewLog: ReviewLogEntry[], targetReviewPct: number): RatioPoint[] {
  const now = new Date();
  const days = eachDayOfInterval({ start: subDays(now, 13), end: now });
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach(e => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });
  return days.map(day => {
    const dayStart = startOfDay(day).getTime();
    const dayEnd = dayStart + 86400000;
    const dayEntries = reviewLog.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd);
    let review = 0, newL = 0;
    dayEntries.forEach(e => {
      const key = `${e.cardId}:${e.sectionId}`;
      const firstSeen = sectionFirstSeen.get(key) || e.timestamp;
      if (firstSeen < dayStart) review++; else newL++;
    });
    const total = review + newL;
    return {
      name: format(day, "dd.MM"),
      "Stvarni ponavljanje": total > 0 ? Math.round((review / total) * 100) : null,
      "Idealni cilj": targetReviewPct,
    };
  });
}

export function buildLevelCounts(cards: Card[]): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  cards.forEach((c) => { counts[masteryLevelPure(c)]++; });
  return counts;
}

export interface ChartBundle {
  activityData: ActivityPoint[];
  masteryData: MasteryPoint[];
  ratioHistory: RatioPoint[];
  levelCounts: number[];
}

export function buildChartBundle(
  cards: Card[],
  reviewLog: ReviewLogEntry[],
  targetReviewPct: number,
): ChartBundle {
  return {
    activityData: buildActivityData(reviewLog, cards),
    masteryData: buildMasteryData(cards),
    ratioHistory: buildRatioHistory(reviewLog, targetReviewPct),
    levelCounts: buildLevelCounts(cards),
  };
}
