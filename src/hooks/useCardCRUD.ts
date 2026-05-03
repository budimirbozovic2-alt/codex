import { useCallback } from "react";
import { invalidateCoverageCache } from "@/lib/coverage-analysis";
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
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";
import { sameSourceModules } from "@/lib/struct-eq";

interface UseCardCRUDParams {
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: React.MutableRefObject<CardMap>;
}

export function useCardCRUD({
  setCardMapState,
  cardMapRef,
}: UseCardCRUDParams) {

  // ── Surgical single-card update (O(1) state + O(1) IDB) — Ref-Delta pattern ──
  const patchCard = useCallback((id: string, patcher: (card: Card) => Card) => {
    const card = cardMapRef.current![id];
    if (!card) return;
    const updated = { ...patcher(card), updatedAt: Date.now() };
    // Invalidate coverage cache only if the linked-source snippet or modules
    // actually changed. Structural compare avoids JSON.stringify thrash and
    // false invalidations from key reordering.
    if (updated.sourceId && (
      updated.originalSourceSnippet !== card.originalSourceSnippet ||
      !sameSourceModules(updated.sourceModules, card.sourceModules)
    )) {
      invalidateCoverageCache(updated.sourceId);
    }
    cardMapRef.current[id] = updated; // In-place ref delta — render never reads ref
    schedulePersist({ type: "put", card: updated });
    setCardMapState(prev => {
      if (!prev[id]) return prev;
      return { ...prev, [id]: updated };
    });
    bumpMapVersion();
  }, [setCardMapState, cardMapRef]);

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
      card.updatedAt = Date.now();
      if (chapterId) { card.chapterId = chapterId; }
      if (extra?.sourceId) card.sourceId = extra.sourceId;
      if (extra?.textAnchor) card.textAnchor = extra.textAnchor;
      if (extra?.originalSourceSnippet) card.originalSourceSnippet = extra.originalSourceSnippet;
      if (extra?.childCardIds) card.childCardIds = extra.childCardIds;
      if (extra?.sourceModules) card.sourceModules = extra.sourceModules;
      if (extra?.tags && extra.tags.length > 0) card.tags = extra.tags;
      cardMapRef.current[card.id] = card; // In-place ref delta
      schedulePersist({ type: "put", card });
      setCardMapState((prev) => ({ ...prev, [card.id]: card }));
      bumpMapVersion();
      return card;
    },
    [setCardMapState],
  );

  const addFlashCard = useCallback(
    (question: string, answer: string, categoryId: string, subcategoryId?: string) => {
      const card = createFlashCard(question, answer, categoryId, subcategoryId);
      card.updatedAt = Date.now();
      cardMapRef.current[card.id] = card; // In-place ref delta
      schedulePersist({ type: "put", card });
      setCardMapState((prev) => ({ ...prev, [card.id]: card }));
      bumpMapVersion();
      return card;
    },
    [setCardMapState],
  );

  // O(1) direct update — surgical IDB write (delegates to patchCard which handles persist)
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
      patchCard(id, (c) => {
        const newCard = { ...c };
        if (updates.question) newCard.question = updates.question;
        if (updates.categoryId) newCard.categoryId = updates.categoryId;
        if (updates.subcategoryId !== undefined) {
          newCard.subcategoryId = updates.subcategoryId;
        }
        if (updates.chapterId !== undefined) {
          newCard.chapterId = updates.chapterId;
        }
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
            // H6 fix: match by id first (preserves FSRS on title rename), then title, then index
            const existing =
              c.sections.find((es) => (s as { id?: string }).id && es.id === (s as { id?: string }).id) ||
              c.sections.find((es) => es.title === s.title) ||
              c.sections[idx];
            if (existing) return { ...existing, title: s.title, content: s.content };
            return createSection(s.title, s.content);
          });
        }
        return newCard;
      });
      toast.success("Kartica ažurirana.");
    },
    [patchCard],
  );

  // Routes deletion through the persist queue so it can coalesce with any
  // pending writes for the same id and flush atomically. No hand-rolled retry.
  const deleteCard = useCallback((id: string) => {
    const card = cardMapRef.current[id];
    if (card?.sourceId) invalidateCoverageCache(card.sourceId);
    delete cardMapRef.current[id]; // In-place ref delta
    setCardMapState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    bumpMapVersion();
    schedulePersist({ type: "delete", id });
    toast.success("Kartica obrisana.");
  }, [setCardMapState, cardMapRef]);

  // Split card — Ref-Delta: read from ref, pre-compute new cards, persist surgically.
  // Both the bulk insert and the original-card deletion go through the persist
  // queue so the queue can serialize/coalesce them atomically.
  const splitCard = useCallback((id: string) => {
    const card = cardMapRef.current![id];
    if (!card || card.sections.length <= 1) return;
    const newCards = card.sections.map(section => ({
      ...createCard(
        card.question,
        [{ title: section.title, content: section.content }],
        card.categoryId,
        card.subcategoryId,
      ),
      sections: [{ ...section }],
      updatedAt: Date.now(),
    }));
    // Sync ref before state update
    delete cardMapRef.current[id]; for (const c of newCards) cardMapRef.current[c.id] = c; // In-place ref delta
    schedulePersist({ type: "bulk", cards: newCards });
    schedulePersist({ type: "delete", id });
    setCardMapState(prev => {
      const next = { ...prev };
      delete next[id];
      newCards.forEach(c => { next[c.id] = c; });
      return next;
    });
    bumpMapVersion();
  }, [setCardMapState, cardMapRef]);

  // Bulk add — single state update + single IDB transaction (eliminates thrashing)
  const bulkAddCards = useCallback((newCards: Card[]) => {
    if (newCards.length === 0) return;
    for (const c of newCards) cardMapRef.current[c.id] = c; // In-place ref delta
    schedulePersist({ type: "bulk", cards: newCards });
    // State must be a fresh reference to trigger re-render
    setCardMapState(prev => {
      const next = { ...prev };
      for (const c of newCards) next[c.id] = c;
      return next;
    });
    bumpMapVersion();
  }, [setCardMapState, cardMapRef]);

  // Convenience: build flash cards from Q/A pairs in one O(n) pass and route
  // through bulkAddCards. Used by mass flash import (BulkImportDialog) and
  // DOCX importer's flash branch — replaces the legacy N×addFlashCard loop
  // which produced O(N²) cardMap clones and froze the UI on large batches.
  const bulkAddFlashCards = useCallback(
    (
      pairs: FlashPair[],
      categoryId: string,
      defaultSubcategoryId?: string,
    ) => {
      if (pairs.length === 0) return;
      const now = Date.now();
      const newCards: Card[] = pairs.map((p) => {
        const card = createFlashCard(
          p.question,
          p.answer,
          categoryId,
          p.subcategoryId ?? defaultSubcategoryId,
        );
        card.updatedAt = now;
        if (p.chapterId) card.chapterId = p.chapterId;
        return card;
      });
      bulkAddCards(newCards);
    },
    [bulkAddCards],
  );

  // O(1) frequency setter — single field, lazy-cleans legacy tags. Triple
  // system ("često"/"rijetko"/"nikad") + null to clear.
  const setFrequency = useCallback(
    (id: string, value: FrequencyTag | null) => {
      patchCard(id, (c) => setCardFrequency(c, value));
    },
    [patchCard],
  );

  return { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard, bulkAddCards, bulkAddFlashCards, setFrequency };
}

