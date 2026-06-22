import type { Card } from "@/lib/spaced-repetition";
import { getCardMasteryLevel } from "@/lib/mastery";

/** Full label for endangered essay concepts (spec step 6). */
export const ENDANGERED_CONCEPT_LABEL = "Ugrožen koncept / Sadrži bube";

export const ENDANGERED_CONCEPT_SHORT = "Ugrožen";

/** Mastery level 5 — hidden when essay is flagged endangered. */
export const MASTERED_MASTERY_LEVEL = 5;

export const MASTERED_ENDANGERED_TOOLTIP =
  "Esej je FSRS savladan, ali blic sateliti imaju rupe.";

export function isEndangeredEssay(card: Card): boolean {
  return card.type === "essay" && !!card.isEndangered;
}

/** Endangered essay that still reaches FSRS mastery level 5. */
export function isMasteredEndangeredEssay(card: Card): boolean {
  return isEndangeredEssay(card) && getCardMasteryLevel(card) === MASTERED_MASTERY_LEVEL;
}

/** Tooltip for endangered badge — extended when essay is mastered but satellites struggle. */
export function endangeredEssayTooltip(card: Card): string {
  if (isMasteredEndangeredEssay(card)) return MASTERED_ENDANGERED_TOOLTIP;
  return ENDANGERED_CONCEPT_LABEL;
}

/** Whether the golden/green "Savladano" mastered badge should render. */
export function shouldShowMasteredBadge(card: Card): boolean {
  if (isEndangeredEssay(card)) return false;
  return getCardMasteryLevel(card) === MASTERED_MASTERY_LEVEL;
}

export function countEndangeredEssays(cards: readonly Card[]): number {
  return cards.filter(isEndangeredEssay).length;
}
