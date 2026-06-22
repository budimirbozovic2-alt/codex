// Card-level FSRS schedule due (nextReview <= now) — distinct from
// consolidation eligibility in review-mode-builder.
import type { Card } from "./types";
import { SectionState } from "./types";

/** Earliest non-New section nextReview for a card, or Infinity. */
export function getCardMinNonNewNextReview(card: Card): number {
  let min = Infinity;
  for (const s of card.sections) {
    if (s.state !== SectionState.New && s.nextReview < min) {
      min = s.nextReview;
    }
  }
  return min;
}

/** True when any non-New section has nextReview <= now. */
export function isCardScheduleDue(card: Card, now: number = Date.now()): boolean {
  return getCardMinNonNewNextReview(card) <= now;
}

/** Count cards with at least one FSRS-scheduled-due section. */
export function countScheduleDueCards(
  cards: readonly Card[],
  now: number = Date.now(),
): number {
  let due = 0;
  for (const card of cards) {
    if (isCardScheduleDue(card, now)) due++;
  }
  return due;
}
