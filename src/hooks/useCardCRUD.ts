import { useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  createCard,
  createFlashCard,
  createSection,
  SourceModule,
  FrequencyTag,
  CardSourceType,
} from "@/lib/spaced-repetition";

export interface FlashPair {
  question: string;
  answer: string;
  subcategoryId?: string;
  chapterId?: string;
}
import { setCardFrequency } from "@/lib/sr/frequency";
import type { CardMap } from "@/lib/persist-queue";
import type { CardMapRefFacade } from "@/store/useCardMapStore";
import { cardRepository } from "@/lib/repositories/cardRepository";
import { cardCommandBus } from "@/lib/repositories/cardCommandBus";

import { logger } from "@/lib/logger";
interface UseCardCRUDParams {
  // Kept for backward-compat with the provider wiring; unused — all writes
  // now flow through cardRepository which owns the store mutation.
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: CardMapRefFacade;
}

export function useCardCRUD(_params: UseCardCRUDParams) {
  void _params; // explicit unused

  const patchCard = useCallback((id: string, patcher: (card: Card) => Card) => {
    void cardCommandBus.dispatch({ type: "patch", id, patcher });
  }, []);

  const addCard = useCallback(
    (
      question: string,
      sections: { title: string; content: string }[],
      categoryId: string,
      subcategoryId?: string,
      chapterId?: string,
      extra?: {
        sourceId?: string;
        textAnchor?: string;
        originalSourceSnippet?: string;
        childCardIds?: string[];
        sourceModules?: SourceModule[];
        tags?: string[];
      },
    ) => {
      const card = createCard(question, sections, categoryId, subcategoryId);
      if (chapterId) card.chapterId = chapterId;
      if (extra?.sourceId) card.sourceId = extra.sourceId;
      if (extra?.textAnchor) card.textAnchor = extra.textAnchor;
      if (extra?.originalSourceSnippet) card.originalSourceSnippet = extra.originalSourceSnippet;
      if (extra?.childCardIds) card.childCardIds = extra.childCardIds;
      if (extra?.sourceModules) card.sourceModules = extra.sourceModules;
      if (extra?.tags && extra.tags.length > 0) card.tags = extra.tags;
      void cardCommandBus.dispatch({ type: "put", card: card });
      return card;
    },
    [],
  );

  const addFlashCard = useCallback(
    (question: string, answer: string, categoryId: string, subcategoryId?: string) => {
      const card = createFlashCard(question, answer, categoryId, subcategoryId);
      void cardCommandBus.dispatch({ type: "put", card: card });
      return card;
    },
    [],
  );

  const updateCard = useCallback(
    (
      id: string,
      updates: {
        question?: string;
        sections?: { title: string; content: string }[];
        categoryId?: string;
        subcategoryId?: string;
        chapterId?: string;
        sourceId?: string;
        textAnchor?: string;
        originalSourceSnippet?: string;
        childCardIds?: string[];
        sourceModules?: SourceModule[];
        needsReview?: boolean;
        frequencyTag?: FrequencyTag;
        sourceType?: CardSourceType;
      },
    ) => {
      void cardCommandBus.dispatch({ type: "patch", id, patcher: (c) => {
        const newCard = { ...c };
        if (updates.question) newCard.question = updates.question;
        if (updates.categoryId) newCard.categoryId = updates.categoryId;
        if (updates.subcategoryId !== undefined) newCard.subcategoryId = updates.subcategoryId;
        if (updates.chapterId !== undefined) newCard.chapterId = updates.chapterId;
        if (updates.sourceId !== undefined) newCard.sourceId = updates.sourceId;
        if (updates.textAnchor !== undefined) newCard.textAnchor = updates.textAnchor;
        if (updates.originalSourceSnippet !== undefined) newCard.originalSourceSnippet = updates.originalSourceSnippet;
        if (updates.childCardIds !== undefined) newCard.childCardIds = updates.childCardIds;
        if (updates.sourceModules !== undefined) newCard.sourceModules = updates.sourceModules;
        if (updates.needsReview !== undefined) newCard.needsReview = updates.needsReview;
        if (updates.frequencyTag !== undefined) newCard.frequencyTag = updates.frequencyTag;
        if (updates.sourceType !== undefined) newCard.sourceType = updates.sourceType;
        if (updates.sections) {
          newCard.sections = updates.sections.map((s, idx) => {
            const existing =
              c.sections.find((es) => (s as { id?: string }).id && es.id === (s as { id?: string }).id) ||
              c.sections.find((es) => es.title === s.title) ||
              c.sections[idx];
            if (existing) return { ...existing, title: s.title, content: s.content };
            return createSection(s.title, s.content);
          });
        }
        return newCard;
      } });
      toast.success("Kartica ažurirana.");
    },
    [],
  );

  const deleteCard = useCallback((id: string) => {
    cardCommandBus.dispatch({ type: "delete", id: id })
      .then(() => toast.success("Kartica obrisana."))
      .catch((err: unknown) => {
        logger.error("[useCardCRUD.deleteCard] dispatch failed", err);
        toast.error("Brisanje nije uspjelo.");
      });
  }, []);

  const splitCard = useCallback((id: string) => {
    const card = cardRepository.get(id);
    if (!card || card.sections.length <= 1) return;
    const newCards = card.sections.map((section) => ({
      ...createCard(
        card.question,
        [{ title: section.title, content: section.content }],
        card.categoryId,
        card.subcategoryId,
      ),
      sections: [{ ...section }],
    }));
    void cardCommandBus.dispatch({ type: "bulkPut", cards: newCards });
    void cardCommandBus.dispatch({ type: "delete", id: id });
  }, []);

  const bulkAddCards = useCallback((newCards: Card[]) => {
    void cardCommandBus.dispatch({ type: "bulkPut", cards: newCards });
  }, []);

  const bulkAddFlashCards = useCallback(
    (pairs: FlashPair[], categoryId: string, defaultSubcategoryId?: string) => {
      if (pairs.length === 0) return;
      const newCards: Card[] = pairs.map((p) => {
        const card = createFlashCard(
          p.question,
          p.answer,
          categoryId,
          p.subcategoryId ?? defaultSubcategoryId,
        );
        if (p.chapterId) card.chapterId = p.chapterId;
        return card;
      });
      void cardCommandBus.dispatch({ type: "bulkPut", cards: newCards });
    },
    [],
  );

  const setFrequency = useCallback((id: string, value: FrequencyTag | null) => {
    void cardCommandBus.dispatch({ type: "patch", id, patcher: (c) => setCardFrequency(c, value) });
  }, []);

  return { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard, bulkAddCards, bulkAddFlashCards, setFrequency };
}
