import type { Card } from "@/lib/spaced-repetition";

export interface SagaDisplayGroup {
  /** Cards shown at the top level (essays, unlinked flashes, etc.). */
  topLevelCards: Card[];
  /** Flash satellites keyed by parent essay id. */
  satellitesByParent: Map<string, Card[]>;
}

/** Whether this card is a flash satellite linked to an essay parent. */
export function isFlashSatellite(card: Card): boolean {
  return card.type === "flash" && !!card.parentId;
}

/** Flash satellites whose parent essay is not in the card set (deleted or import gap). */
export function findOrphanSatellites(cards: readonly Card[]): Card[] {
  const ids = new Set(cards.map((c) => c.id));
  return cards.filter(
    (c) => isFlashSatellite(c) && !!c.parentId && !ids.has(c.parentId),
  );
}

/** Flash satellites whose parent essay is in the same filtered card set. */
export function buildSatellitesByParent(cards: readonly Card[]): Map<string, Card[]> {
  return groupCardsForSagaDisplay(cards).satellitesByParent;
}

/**
 * Exclude linked flash satellites from the learn queue when their parent essay
 * is also queued — the parent essay's saga pass covers them.
 */
export function excludeNestedSatellitesFromLearnQueue(cards: readonly Card[]): Card[] {
  const ids = new Set(cards.map((c) => c.id));
  return cards.filter(
    (c) => !isFlashSatellite(c) || !c.parentId || !ids.has(c.parentId),
  );
}

/**
 * Bury flash-satellite items when their parent essay is also in the same
 * review queue (Anki-style sibling burying). Orphan satellites stay visible.
 */
export function excludeBurySagaSiblings<T extends { card: Card }>(
  items: readonly T[],
): T[] {
  const parentEssayIds = new Set(
    items.filter((i) => i.card.type === "essay").map((i) => i.card.id),
  );
  return items.filter((item) => {
    if (!isFlashSatellite(item.card) || !item.card.parentId) return true;
    return !parentEssayIds.has(item.card.parentId);
  });
}

/** Partition cards for saga-aware list rendering. Satellites nest under their essay. */
export function groupCardsForSagaDisplay(cards: readonly Card[]): SagaDisplayGroup {
  const cardIds = new Set(cards.map((c) => c.id));
  const satellitesByParent = new Map<string, Card[]>();

  for (const card of cards) {
    if (
      isFlashSatellite(card) &&
      card.parentId &&
      cardIds.has(card.parentId)
    ) {
      const list = satellitesByParent.get(card.parentId) ?? [];
      list.push(card);
      satellitesByParent.set(card.parentId, list);
    }
  }

  for (const list of satellitesByParent.values()) {
    list.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.createdAt - b.createdAt,
    );
  }

  const topLevelCards = cards.filter((c) => {
    if (!isFlashSatellite(c)) return true;
    // Parent not in filtered view → show satellite standalone.
    return !c.parentId || !cardIds.has(c.parentId);
  });

  return { topLevelCards, satellitesByParent };
}

export interface OrgEssayGroup {
  card: Card;
  satellites: Card[];
}

/** Group chapter cards into essay folders + standalone tiles for org mode. */
export function groupChapterCardsForOrg(
  chapterCards: readonly Card[],
  allCards: readonly Card[],
): OrgEssayGroup[] {
  const { satellitesByParent } = groupCardsForSagaDisplay(allCards);
  const satelliteIds = new Set(
    allCards.filter(isFlashSatellite).map((c) => c.id),
  );

  return chapterCards
    .filter((c) => !satelliteIds.has(c.id))
    .map((card) => ({
      card,
      satellites:
        card.type === "essay"
          ? (satellitesByParent.get(card.id) ?? [])
          : [],
    }));
}
