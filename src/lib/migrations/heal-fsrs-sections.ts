/**
 * Heal legacy / imported FSRS section rows missing `lastReviewed`.
 * Without it, getRetrievability treats elapsed=0 and consolidation modes
 * skip overdue Review sections.
 */
import type { Card, Section } from "@/lib/spaced-repetition";
import { SectionState } from "@/lib/spaced-repetition";

const DAY_MS = 24 * 60 * 60 * 1000;

export function healSectionLastReviewed(
  section: Section,
  now: number = Date.now(),
): Section {
  if (section.state === SectionState.New) return section;
  if (section.lastReviewed != null && section.lastReviewed > 0) return section;

  let lastReviewed: number;
  if (section.elapsedDays > 0) {
    lastReviewed = now - section.elapsedDays * DAY_MS;
  } else if (section.interval > 0) {
    lastReviewed = section.nextReview - section.interval * DAY_MS;
  } else if (section.stability > 0) {
    lastReviewed = section.nextReview - section.stability * DAY_MS;
  } else {
    lastReviewed = Math.min(section.nextReview, now - DAY_MS);
  }

  lastReviewed = Math.max(0, Math.min(lastReviewed, now));
  return { ...section, lastReviewed };
}

export function healCardFsrsSections(
  card: Card,
  now: number = Date.now(),
): Card {
  let changed = false;
  const sections = card.sections.map((s) => {
    const next = healSectionLastReviewed(s, now);
    if (next !== s) changed = true;
    return next;
  });
  return changed ? { ...card, sections } : card;
}

export function healCardsFsrsSections(
  cards: readonly Card[],
  now: number = Date.now(),
): { cards: Card[]; cardsHealed: number; sectionsHealed: number } {
  let cardsHealed = 0;
  let sectionsHealed = 0;
  const out = cards.map((card) => {
    let cardChanged = false;
    const sections = card.sections.map((s) => {
      const next = healSectionLastReviewed(s, now);
      if (next !== s) {
        cardChanged = true;
        sectionsHealed++;
      }
      return next;
    });
    if (cardChanged) {
      cardsHealed++;
      return { ...card, sections };
    }
    return card;
  });
  return { cards: out, cardsHealed, sectionsHealed };
}
