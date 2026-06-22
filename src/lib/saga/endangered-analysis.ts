import type { Card } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { GRADE_LABELS } from "@/components/learn/types";
import { countEssaySatellites } from "@/lib/saga/saga-attach";

export interface EndangeredCause {
  satelliteId: string;
  satelliteQuestion: string;
  grade: number;
  gradeLabel: string;
  timestamp: number;
}

export interface EndangeredEssaySummary {
  essay: Card;
  cause: EndangeredCause | null;
  satelliteCount: number;
}

/** Latest Again (grade 1) on any satellite — typical trigger for endangered flag. */
export function findEndangeredCause(
  essay: Card,
  allCards: readonly Card[],
  reviewLog: readonly ReviewLogEntry[],
): EndangeredCause | null {
  const satellites = allCards.filter(
    (c) => c.type === "flash" && c.parentId === essay.id,
  );
  if (satellites.length === 0) return null;

  let latest: EndangeredCause | null = null;
  for (const sat of satellites) {
    const againEntries = reviewLog
      .filter((e) => e.cardId === sat.id && e.grade === 1)
      .sort((a, b) => b.timestamp - a.timestamp);
    const entry = againEntries[0];
    if (!entry) continue;
    if (!latest || entry.timestamp > latest.timestamp) {
      latest = {
        satelliteId: sat.id,
        satelliteQuestion: sat.question || "(Bez pitanja)",
        grade: 1,
        gradeLabel: GRADE_LABELS[1] ?? "Ponovo",
        timestamp: entry.timestamp,
      };
    }
  }
  return latest;
}

/** Summaries for dashboard / subject views. */
export function buildEndangeredEssaySummaries(
  essays: readonly Card[],
  allCards: readonly Card[],
  reviewLog: readonly ReviewLogEntry[],
): EndangeredEssaySummary[] {
  return essays.map((essay) => ({
    essay,
    cause: findEndangeredCause(essay, allCards, reviewLog),
    satelliteCount: countEssaySatellites(allCards, essay.id),
  }));
}

export function formatEndangeredCauseLine(cause: EndangeredCause | null): string {
  if (!cause) return "Satelit sa ocjenom „Ponovo“ — provjerite blic pitanja.";
  const q =
    cause.satelliteQuestion.length > 60
      ? `${cause.satelliteQuestion.slice(0, 60)}…`
      : cause.satelliteQuestion;
  return `Zadnji „${cause.gradeLabel}“: „${q}“`;
}
