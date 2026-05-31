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
import type { EditorDoc } from "@/lib/editor-v4/types";

export interface FlashPair {
  question: string;
  answer: string;
  subcategoryId?: string;
  chapterId?: string;
}
import { setCardFrequency } from "@/lib/sr/frequency";
import { getCard } from "@/domains/cards";
import { useCardMutations } from "@/hooks/card/useCardMutations";

import { logger } from "@/lib/logger";

export function useCardCRUD() {
  const { save, remove, bulkUpsert, gradeSection } = useCardMutations();

  // patchCard remains a fire-and-forget surface (void return) so the many
  // sync consumers (useCardAnnotations, etc.) keep their signatures, but
  // internally we route through the gradeSection mutation so onError
  // rollback + ['cards'] invalidation flow uniformly.
  const patchCard = useCallback(
    (id: string, patcher: (card: Card) => Card) => {
      void gradeSection.mutateAsync({ cardId: id, patcher });
    },
    [gradeSection],
  );

  const addCard = useCallback(
    (
      question: string,
      sections: { title: string; contentDoc: EditorDoc }[],
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
      void save.mutateAsync(card);
      return card;
    },
    [save],
  );

  const addFlashCard = useCallback(
    (question: string, answer: string, categoryId: string, subcategoryId?: string) => {
      const card = createFlashCard(question, answer, categoryId, subcategoryId);
      void save.mutateAsync(card);
      return card;
    },
    [save],
  );

  const updateCard = useCallback(
    (
      id: string,
      updates: {
        question?: string;
        sections?: { title: string; contentDoc: EditorDoc }[];
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
      void gradeSection.mutateAsync({
        cardId: id,
        patcher: (c) => {
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
              if (existing) {
                return { ...existing, title: s.title, contentDoc: s.contentDoc };
              }
              return createSection(s.title, s.contentDoc);
            });
          }
          return newCard;
        },
      });
      toast.success("Kartica ažurirana.");
    },
    [gradeSection],
  );

  const deleteCard = useCallback(
    (id: string) => {
      try {
        void remove.mutateAsync(id);
        toast.success("Kartica obrisana.");
      } catch (err) {
        logger.error("[useCardCRUD.deleteCard] failed", err);
        toast.error("Brisanje nije uspjelo.");
      }
    },
    [remove],
  );

  const splitCard = useCallback(
    async (id: string) => {
      const card = getCard(id);
      if (!card || card.sections.length <= 1) return;
      const newCards = card.sections.map((section) => ({
        ...createCard(
          card.question,
          [{ title: section.title, contentDoc: section.contentDoc }],
          card.categoryId,
          card.subcategoryId,
        ),
        sections: [{ ...section }],
      }));
      // PR-B: sequentially await bulkUpsert BEFORE remove. Firing both with
      // `void` allowed `remove` to commit before `bulkUpsert` reached SQLite,
      // so a crash in that window deleted the source card without persisting
      // the splits — irreversible data loss.
      try {
        await bulkUpsert.mutateAsync(newCards);
        await remove.mutateAsync(id);
      } catch (err) {
        logger.error("[useCardCRUD.splitCard] failed", err);
        toast.error("Razdvajanje kartice nije uspjelo.");
      }
    },
    [bulkUpsert, remove],
  );

  const bulkAddCards = useCallback(
    (newCards: Card[]) => {
      void bulkUpsert.mutateAsync(newCards);
    },
    [bulkUpsert],
  );

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
      void bulkUpsert.mutateAsync(newCards);
    },
    [bulkUpsert],
  );

  const setFrequency = useCallback(
    (id: string, value: FrequencyTag | null) => {
      void gradeSection.mutateAsync({
        cardId: id,
        patcher: (c) => setCardFrequency(c, value),
      });
    },
    [gradeSection],
  );

  return { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard, bulkAddCards, bulkAddFlashCards, setFrequency };
}
