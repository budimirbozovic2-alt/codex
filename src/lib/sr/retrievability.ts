// Retrievability + mastery score helpers. Pure read-only views over Section/Card.
import { Section, SectionState, Card } from "./types";

export function getRetrievability(
  section: Section,
  now: number = Date.now(),
): number {
  if (section.state === SectionState.New) return 0;
  if (section.stability <= 0) return 0;
  // Missing lastReviewed on a reviewed section → unknown retention; prefer review.
  if (section.lastReviewed == null || section.lastReviewed <= 0) return 0;
  const elapsed = (now - section.lastReviewed) / (24 * 60 * 60 * 1000);
  const r = Math.exp(-elapsed / section.stability);
  return Math.round(Math.max(0, Math.min(100, r * 100)));
}

/**
 * Card-level retrievability surfaces the WORST (lowest) section, not the
 * mean. A card with sections [95, 95, 20] reports 20 — the failing module
 * is the actual risk. Averaging hides it.
 */
export function getCardRetrievability(card: Card): number {
  if (card.sections.length === 0) return 0;
  const reviewed = card.sections.filter((s) => s.state !== SectionState.New);
  if (reviewed.length === 0) return 0;
  let min = Infinity;
  for (const s of reviewed) {
    const r = getRetrievability(s, Date.now());
    if (r < min) min = r;
  }
  return min === Infinity ? 0 : min;
}

export function getSectionScore(section: Section): number {
  if (section.state === SectionState.New) return 0;
  const stabilityScore = Math.min(section.stability / 30, 1);
  const difficultyBonus = (10 - section.difficulty) / 9;
  return Math.round((stabilityScore * 0.7 + difficultyBonus * 0.3) * 100);
}

export function getCardScore(card: Card): number {
  if (card.sections.length === 0) return 0;
  return Math.round(card.sections.reduce((sum, s) => sum + getSectionScore(s), 0) / card.sections.length);
}
