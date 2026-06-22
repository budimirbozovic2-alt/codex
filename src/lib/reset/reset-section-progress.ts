import type { Card, Section } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";

/** Reset FSRS fields on a section while keeping id, title, and contentDoc. */
export function resetSectionLearningProgress(
  section: Section,
  now: number = Date.now(),
): Section {
  return {
    ...section,
    state: SectionState.New,
    stability: 0,
    difficulty: 5,
    interval: 0,
    nextReview: now,
    lastReviewed: null,
    lapses: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    firstReviewPending: false,
  };
}

/** Reset per-card learning progress; preserves taxonomy, content, and links. */
export function resetCardLearningProgress(
  card: Card,
  now: number = Date.now(),
): Card {
  return {
    ...card,
    readCount: 0,
    errorLog: [],
    needsReview: undefined,
    sections: card.sections.map((s) => resetSectionLearningProgress(s, now)),
    isEndangered: false,
    updatedAt: now,
  };
}
