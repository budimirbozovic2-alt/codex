// Phase 3+4 — slim sync effects.
//
// Post-Phase-4: cardCommandBus retired. All writes go through cardRepository.
// CARDS_UPDATED-driven cache invalidation lives in module-level
// `cardMapInvalidator` (initialized in main.tsx). What remains here is
// strictly the cross-module wiring tied to React lifecycle.
import { useEffect } from "react";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { initBacklinkIndexSubscriptions } from "@/lib/backlink-index";
import { cardRepository } from "@/lib/repositories/cardRepository";

export function useCardSyncEffects(): void {
  useEffect(() => initBacklinkIndexSubscriptions(), []);

  useEffect(() => onCardLinksCleared((ids) => {
    cardRepository.clearLinks(ids);
  }), []);

  useEffect(() => onCardReviewConfirmed((cardId) => {
    cardRepository.clearNeedsReview(cardId);
  }), []);
}
