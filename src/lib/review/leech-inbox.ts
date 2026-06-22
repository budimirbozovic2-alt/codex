import {
  type Card,
  type Section,
  type SRSettings,
  SectionState,
  isLeech,
} from "@/lib/spaced-repetition";
import { resolveEffectiveSrParams } from "@/domains/subjects/subject-settings";

export interface LeechInboxItem {
  card: Card;
  section: Section;
  lapses: number;
  parentEssay: Card | null;
}

/** All leech sections across the library (central inbox, not hardest-mode only). */
export function collectLeechInboxItems(
  cards: readonly Card[],
  globalSrSettings: SRSettings,
): LeechInboxItem[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const items: LeechInboxItem[] = [];

  for (const card of cards) {
    const { srSettings } = resolveEffectiveSrParams(card.categoryId, globalSrSettings);
    for (const section of card.sections ?? []) {
      if (section.state === SectionState.New) continue;
      if (!isLeech(section, srSettings)) continue;
      items.push({
        card,
        section,
        lapses: section.lapses ?? 0,
        parentEssay: card.parentId ? byId.get(card.parentId) ?? null : null,
      });
    }
  }

  items.sort((a, b) => b.lapses - a.lapses || a.card.question.localeCompare(b.card.question));
  return items;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bump section nextReview without FSRS grade (snooze / postpone). */
export function postponeSection(
  card: Card,
  sectionId: string,
  days: number,
  now: number = Date.now(),
): Card {
  const bump = days * DAY_MS;
  return {
    ...card,
    sections: card.sections.map((s) =>
      s.id !== sectionId
        ? s
        : { ...s, nextReview: Math.max(s.nextReview, now) + bump },
    ),
  };
}

/** Remove sibling satellite items from a review queue (Anki bury siblings). */
export function burySiblingSatelliteItems(
  items: readonly { card: Card }[],
  parentId: string,
  keepCardId: string,
  fromIndex: number,
): { card: Card }[] {
  const head = items.slice(0, fromIndex);
  const tail = items.slice(fromIndex).filter(
    (item) =>
      !(
        item.card.type === "flash" &&
        item.card.parentId === parentId &&
        item.card.id !== keepCardId
      ),
  );
  return [...head, ...tail];
}
