/**
 * Denormalised per-card mastery score (0–100 float average of section scores).
 * Kept in sync on every card write via `bindCardInsert`.
 */
import type { Card } from "@/lib/sr/types";
import { getSectionScore } from "@/lib/sr/retrievability";
import { getCardMasteryLevel } from "@/lib/mastery";

/** Matches `useCardAggregates` scoreAvg — float average, rounded at category level. */
export function computeCardMasteryScore(card: Card): number {
  if (card.sections.length === 0) return 0;
  let scoreSum = 0;
  for (const s of card.sections) {
    scoreSum += getSectionScore(s);
  }
  return scoreSum / card.sections.length;
}

/** 0–5 bucket used by CategoryView mastery bar — mirrors `getCardMasteryLevel`. */
export function computeCardMasteryLevel(card: Card): number {
  return getCardMasteryLevel(card);
}
