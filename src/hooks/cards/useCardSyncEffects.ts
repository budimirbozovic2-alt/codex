// Cross-module wiring tied to React lifecycle.
//
// Post Task-B: BacklinkIndex no longer needs an EventBus subscription —
// callers update the index directly via `backlinkIndex.upsertArticle` /
// `removeArticle`. What remains here is the source-storage callback wiring,
// which is genuinely lifecycle-bound.
//
// Writes route through cardRepository (atomic runInTransaction — no queue).
import { useEffect } from "react";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/domains/sources/sources-storage";
import { cardRepository } from "@/lib/repositories";
import { logger } from "@/lib/logger";

export function useCardSyncEffects(): void {
  useEffect(() => onCardLinksCleared((ids) => {
    void cardRepository.clearLinks(ids).catch((e) =>
      logger.warn("[useCardSyncEffects] clearLinks failed", e),
    );
  }), []);

  useEffect(() => onCardReviewConfirmed((cardId) => {
    void cardRepository.clearNeedsReview(cardId).catch((e) =>
      logger.warn("[useCardSyncEffects] clearNeedsReview failed", e),
    );
  }), []);
}
