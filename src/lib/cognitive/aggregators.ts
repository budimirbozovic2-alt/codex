/**
 * Pure cognitive-analytics aggregators.
 *
 * No imports from `@/lib/storage`, `@/lib/db**`, `@/contexts/**`, or React.
 * Receives snapshots from main-thread adapters (see `useCognitiveStats`).
 */
import { type Card, getErrorStatus } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { CalibrationEntry, LatencyEntry } from "@/domains/metacognition/metacognitive-storage";

export interface CognitiveCountsSnapshots {
  calibration: CalibrationEntry[];
  latency: LatencyEntry[];
  examDate: string | null;
}

export interface CognitiveCounts {
  cards: number;
  cardsWithErrors: number;
  activeErrors: number;
  totalErrors: number;
  sectionsWithReview: number;
  totalSections: number;
  reviewLog: number;
  subjectCalibration: number;
  subjectLatency: number;
  examDate: string | null;
}

export function calcCognitiveCounts(
  cards: Card[],
  reviewLog: ReviewLogEntry[],
  snapshots: CognitiveCountsSnapshots,
): CognitiveCounts {
  const cardIds = new Set(cards.map((c) => c.id));

  let cardsWithErrors = 0;
  let activeErrors = 0;
  let totalErrors = 0;
  let sectionsWithReview = 0;
  let totalSections = 0;

  cards.forEach((c) => {
    const log = c.errorLog || [];
    if (log.length > 0) cardsWithErrors++;
    log.forEach((e) => {
      totalErrors++;
      if (getErrorStatus(e) !== "mastered") activeErrors++;
    });
    c.sections.forEach((s) => {
      totalSections++;
      if (s.lastReviewed) sectionsWithReview++;
    });
  });

  const subjectCalibration = snapshots.calibration.filter((e) => cardIds.has(e.cardId)).length;
  const subjectLatency = snapshots.latency.filter((e) => cardIds.has(e.cardId)).length;

  return {
    cards: cards.length,
    cardsWithErrors,
    activeErrors,
    totalErrors,
    sectionsWithReview,
    totalSections,
    reviewLog: reviewLog.length,
    subjectCalibration,
    subjectLatency,
    examDate: snapshots.examDate,
  };
}
