/**
 * Denormalised per-card mastery score (0–100 float average of section scores).
 * Kept in sync on every card write via `bindCardInsert`.
 */
import type { Card } from "@/lib/spaced-repetition";
import { getSectionScore } from "@/lib/spaced-repetition";

/** Matches `useCardAggregates` scoreAvg — float average, rounded at category level. */
export function computeCardMasteryScore(card: Card): number {
  if (card.sections.length === 0) return 0;
  let scoreSum = 0;
  for (const s of card.sections) {
    scoreSum += getSectionScore(s);
  }
  return scoreSum / card.sections.length;
}
