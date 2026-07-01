import type { Card } from "@/lib/spaced-repetition";

/**
 * Zettelkasten articles whose knowledge network is weakening: an article is
 * "endangered" when at least one card linked to it (via `linkedArticleId`) is
 * flagged `isEndangered`. The flag is denormalised onto essays when a flash
 * satellite is graded Again (see card-saga-endangered-sync) — here we surface
 * that signal at the concept level so the wiki reflects review health.
 */
export function buildEndangeredArticleIds(
  cards: readonly Card[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const card of cards) {
    if (card.isEndangered && card.linkedArticleId) {
      ids.add(card.linkedArticleId);
    }
  }
  return ids;
}
