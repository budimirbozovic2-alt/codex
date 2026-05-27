/**
 * Pure aggregator for SubjectDashboard "Prikaz Znanja" section.
 *
 * Computes per-subcategory and per-chapter knowledge progress (card
 * counts, learned-section %, mastery rollups) in a single pass over
 * the subject's card set. No React, no storage, no DOM — direct unit
 * tests can drive this with synthetic Card arrays.
 *
 * Behaviour matches the original inline `useMemo(subProgressData)` block
 * in `src/views/SubjectDashboard.tsx`: percentages are integer-rounded,
 * mastery is the mean of `getCardMasteryLevel` over the bucket, and a
 * bucket with zero cards reports `pct = 0`, `mastery = 0`.
 */

import { getCardMasteryLevel } from "@/lib/mastery";
import { SectionState, type Card } from "@/lib/spaced-repetition";

export interface ChapterProgress {
  id: string;
  name: string;
  cardCount: number;
  pct: number;
  mastery: number;
}

export interface SubProgress {
  id: string;
  name: string;
  cardCount: number;
  pct: number;
  mastery: number;
  chapters: ChapterProgress[];
}

export interface ChapterInput {
  id: string;
  name: string;
}

export interface SubcategoryInput {
  id: string;
  name: string;
  chapters?: ChapterInput[];
}

function computePct(cards: Card[]): number {
  const totalSections = cards.reduce((s, c) => s + (c.sections?.length ?? 0), 0);
  if (totalSections === 0) return 0;
  const learnedSections = cards.reduce(
    (s, c) => s + (c.sections?.filter((sec) => sec.state !== SectionState.New).length ?? 0),
    0,
  );
  return Math.round((learnedSections / totalSections) * 100);
}

function computeMastery(cards: Card[]): number {
  if (cards.length === 0) return 0;
  return Math.round(
    cards.reduce((s, c) => s + getCardMasteryLevel(c), 0) / cards.length,
  );
}

/**
 * Bucket the subject's cards by subcategory and chapter once, then roll
 * up percentages and mastery in a single traversal of the taxonomy.
 */
export function aggregateSubjectProgress(
  subjectCards: Card[],
  subcategories: SubcategoryInput[],
): SubProgress[] {
  const bySub = new Map<string, Card[]>();
  const byCh = new Map<string, Card[]>();
  for (const c of subjectCards) {
    if (c.subcategoryId) {
      const arr = bySub.get(c.subcategoryId);
      if (arr) arr.push(c); else bySub.set(c.subcategoryId, [c]);
    }
    if (c.chapterId) {
      const arr = byCh.get(c.chapterId);
      if (arr) arr.push(c); else byCh.set(c.chapterId, [c]);
    }
  }

  return subcategories.map((sub) => {
    const subCards = bySub.get(sub.id) ?? [];
    const chapters: ChapterProgress[] = (sub.chapters ?? []).map((ch) => {
      const chCards = byCh.get(ch.id) ?? [];
      return {
        id: ch.id,
        name: ch.name,
        cardCount: chCards.length,
        pct: computePct(chCards),
        mastery: computeMastery(chCards),
      };
    });
    return {
      id: sub.id,
      name: sub.name,
      cardCount: subCards.length,
      pct: computePct(subCards),
      mastery: computeMastery(subCards),
      chapters,
    };
  });
}
