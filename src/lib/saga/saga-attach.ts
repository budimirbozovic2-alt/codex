import type { Card } from "@/lib/spaced-repetition";
import { isFlashSatellite } from "@/lib/saga/card-saga-grouping";

/** Above this count, an essay concept is considered overloaded with micro-questions. */
export const SATELLITE_OVERLOAD_THRESHOLD = 8;

export function countEssaySatellites(allCards: readonly Card[], essayId: string): number {
  return allCards.filter((c) => isFlashSatellite(c) && c.parentId === essayId).length;
}

export interface EssaySatelliteLoad {
  current: number;
  afterAttach: number;
  isOverloaded: boolean;
  newAttachments: number;
}

/** Preview satellite load when attaching one or more flash cards to an essay. */
export function previewEssaySatelliteLoad(
  allCards: readonly Card[],
  essayId: string,
  flashIds: readonly string[],
): EssaySatelliteLoad {
  const current = countEssaySatellites(allCards, essayId);
  const newAttachments = flashIds.filter((id) => {
    const card = allCards.find((c) => c.id === id);
    return card && card.parentId !== essayId;
  }).length;
  const afterAttach = current + newAttachments;
  return {
    current,
    afterAttach,
    isOverloaded: afterAttach > SATELLITE_OVERLOAD_THRESHOLD,
    newAttachments,
  };
}
