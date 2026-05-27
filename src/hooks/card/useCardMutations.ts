/**
 * PR-7f M3f — Cards cut-over.
 *
 * Wraps `cardRepository` async writes in `useMutation` so the call-site
 * surface follows the uniform M3 pattern: optimistic RAM commit happens
 * inside the repo (Zustand `cardMapStore`), persist is awaited inside the
 * mutationFn (`*Async` variants), and the bridge
 * (`onCardsChanged → invalidateQueries(['cards'])`) picks up
 * `notifyCardsChanged` in onSettled.
 *
 * onError rollback: when persist fails (`WriteResult.ok === false`) we
 * re-read the affected ids from IDB via `cardRepository.reloadFromIdb`
 * to bring RAM back in sync with the durable SSOT. There is no
 * `setQueryData` snapshot — cards are read via Zustand selectors, not
 * TanStack caches.
 *
 * `cardCommandBus`/`keyedMutex` around DB writes are DEPRECATED (see Core
 * memory). SQLite ACID + persistQueue ordering is the only serialization
 * primitive.
 */
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Card } from "@/lib/spaced-repetition";
import { cardRepository } from "@/lib/repositories";
import type { WriteResult } from "@/lib/persistence/write-result";
import { logger } from "@/lib/logger";

function assertOk<T>(r: WriteResult<T>): T {
  if (!r.ok) throw new Error(r.error.message || r.error.code);
  return r.value;
}

interface GradeInput {
  cardId: string;
  patcher: (card: Card) => Card;
}

interface BulkPatchInput {
  cardIds: string[];
  patcher: (card: Card) => Card;
}

export function useCardMutations() {
  const save = useMutation<Card, Error, Card>({
    mutationFn: async (card) => assertOk(await cardRepository.putAsync(card)),
    onError: (err, card) => {
      logger.error("[useCardMutations] save persist failed", { id: card.id, err });
      toast.error("Snimanje kartice nije uspjelo — vraćam stanje.");
      void cardRepository.reloadFromIdb([card.id]);
    },
  });

  const remove = useMutation<void, Error, string>({
    mutationFn: async (id) => { assertOk(await cardRepository.removeAsync(id)); },
    onError: (err, id) => {
      logger.error("[useCardMutations] remove persist failed", { id, err });
      toast.error("Brisanje nije uspjelo — vraćam stanje.");
      void cardRepository.reloadFromIdb([id]);
    },
  });

  const bulkUpsert = useMutation<Card[], Error, Card[]>({
    mutationFn: async (cards) => assertOk(await cardRepository.bulkPutAsync(cards)),
    onError: (err, cards) => {
      logger.error("[useCardMutations] bulkUpsert persist failed", { n: cards.length, err });
      toast.error("Snimanje serije kartica nije uspjelo — vraćam stanje.");
      void cardRepository.reloadFromIdb(cards.map(c => c.id));
    },
  });

  /**
   * Single-card grading / annotation patch. Used by gradeSection,
   * markRead, toggleTag, addKeyPart, logError, clearErrorLog, setFrequency.
   */
  const gradeSection = useMutation<Card | undefined, Error, GradeInput>({
    mutationFn: async ({ cardId, patcher }) =>
      assertOk(await cardRepository.patchAsync(cardId, patcher)),
    onError: (err, { cardId }) => {
      logger.error("[useCardMutations] gradeSection persist failed", { cardId, err });
      toast.error("Snimanje gradacije nije uspjelo — vraćam stanje.");
      void cardRepository.reloadFromIdb([cardId]);
    },
  });

  const bulkPatch = useMutation<Card[], Error, BulkPatchInput>({
    mutationFn: async ({ cardIds, patcher }) =>
      assertOk(await cardRepository.bulkPatchAsync(cardIds, patcher)),
    onError: (err, { cardIds }) => {
      logger.error("[useCardMutations] bulkPatch persist failed", { n: cardIds.length, err });
      toast.error("Bulk izmjena nije uspjela — vraćam stanje.");
      void cardRepository.reloadFromIdb(cardIds);
    },
  });

  return { save, remove, bulkUpsert, gradeSection, bulkPatch };
}
