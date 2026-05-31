// Cross-module wiring tied to React lifecycle.
//
// Post Task-B: BacklinkIndex no longer needs an EventBus subscription —
// callers update the index directly via `backlinkIndex.upsertArticle` /
// `removeArticle`. What remains here is the source-storage callback wiring,
// which is genuinely lifecycle-bound.
import { useEffect } from "react";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { clearLinks, clearNeedsReview } from "@/domains/cards";

export function useCardSyncEffects(): void {
  useEffect(() => onCardLinksCleared((ids) => {
    clearLinks(ids);
  }), []);

  useEffect(() => onCardReviewConfirmed((cardId) => {
    clearNeedsReview(cardId);
  }), []);
}
