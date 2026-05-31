// Cross-module wiring tied to React lifecycle.
//
// Post Task-B: BacklinkIndex no longer needs an EventBus subscription —
// callers update the index directly via `backlinkIndex.upsertArticle` /
// `removeArticle`. What remains here is the source-storage callback wiring,
// which is genuinely lifecycle-bound.
//
// PR-E3: writes route through direct SQLite helpers — no Zustand RAM mirror.
import { useEffect } from "react";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { clearCardLinksDirect, clearCardNeedsReviewDirect } from "@/lib/db/queries";
import { logger } from "@/lib/logger";

export function useCardSyncEffects(): void {
  useEffect(() => onCardLinksCleared((ids) => {
    void clearCardLinksDirect(ids).catch((e) =>
      logger.warn("[useCardSyncEffects] clearCardLinksDirect failed", e),
    );
  }), []);

  useEffect(() => onCardReviewConfirmed((cardId) => {
    void clearCardNeedsReviewDirect(cardId).catch((e) =>
      logger.warn("[useCardSyncEffects] clearCardNeedsReviewDirect failed", e),
    );
  }), []);
}
