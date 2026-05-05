// M1 decomposition — sync effects extracted from CardStateProvider.
// Listens to source-link / review-confirmed / CARDS_UPDATED bus events and
// routes mutations through cardRepository.
import { useEffect } from "react";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { initBacklinkIndexSubscriptions } from "@/lib/backlink-index";
import { persistQueue } from "@/lib/persist-queue";
import { cardRepository } from "@/lib/repositories/cardRepository";
import type { Card } from "@/lib/spaced-repetition";

interface CardsUpdatedPayload {
  source?: string;
  cardIds?: string[];
}

const SURGICAL_LIMIT = 200;

export function useCardSyncEffects(): void {
  useEffect(() => initBacklinkIndexSubscriptions(), []);

  useEffect(() => onCardLinksCleared((ids) => {
    cardRepository.clearLinks(ids);
  }), []);

  useEffect(() => onCardReviewConfirmed((cardId) => {
    cardRepository.clearNeedsReview(cardId);
  }), []);

  useEffect(() => {
    let isSubscribed = true;
    let fetchSequence = 0;

    const unsub = eventBus.subscribe<CardsUpdatedPayload>(EVENT_TYPES.CARDS_UPDATED, (payload) => {
      const currentSequence = ++fetchSequence;
      const ids = payload?.cardIds;
      const drainThenFetch = persistQueue.cleanup();

      if (ids && ids.length > 0 && ids.length <= SURGICAL_LIMIT) {
        drainThenFetch.then(() => import("@/lib/db")).then(({ db }) => {
          db.cards.bulkGet(ids).then((rows) => {
            if (!isSubscribed || currentSequence !== fetchSequence) return;
            const localMap = cardRepository.snapshot();
            const fetched = rows
              .filter((r): r is Card => !!r)
              .filter((r) => {
                const local = localMap[r.id];
                if (!local) return true;
                return (r.updatedAt ?? 0) >= (local.updatedAt ?? 0);
              });
            const fetchedIds = new Set(fetched.map((c) => c.id));
            const deletedIds = ids.filter((id) => !fetchedIds.has(id));
            if (fetched.length === 0 && deletedIds.length === 0) return;
            cardRepository.applySyncDelta(fetched, deletedIds);
          });
        });
        return;
      }

      drainThenFetch.then(() => import("@/lib/db-queries")).then(({ idbLoadCards }) => {
        idbLoadCards().then((loaded) => {
          if (!isSubscribed || currentSequence !== fetchSequence) return;
          const map: Record<string, Card> = {};
          for (const c of loaded) map[c.id] = c;
          cardRepository.replaceAll(map);
        });
      });
    });

    return () => { isSubscribed = false; unsub(); };
  }, []);
}
