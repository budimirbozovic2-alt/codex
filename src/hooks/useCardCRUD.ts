import { useCallback, useRef } from "react";
import { idbDeleteCard } from "@/lib/db";
import { toast } from "sonner";
import {
  Card,
  createCard,
  createFlashCard,
  createSection,
  SourceModule,
} from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion, schedulePersist } from "@/lib/persist-queue";

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
    cardMapRef.current = { ...cardMapRef.current, [id]: updated }; // Sync ref — prevents double-mutation race
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
      category: string,
      subcategory?: string,
      chapter?: string,
      extra?: {
        sourceId?: string;
        textAnchor?: string;
        originalSourceSnippet?: string;
        childCardIds?: string[];
        sourceModules?: SourceModule[];
      },
    ) => {
      const card = createCard(question, sections, category, subcategory);
      card.updatedAt = Date.now();
      if (chapter) card.chapter = chapter;
      if (extra?.sourceId) card.sourceId = extra.sourceId;
      if (extra?.textAnchor) card.textAnchor = extra.textAnchor;
      if (extra?.originalSourceSnippet) card.originalSourceSnippet = extra.originalSourceSnippet;
      if (extra?.childCardIds) card.childCardIds = extra.childCardIds;
      if (extra?.sourceModules) card.sourceModules = extra.sourceModules;
      cardMapRef.current = { ...cardMapRef.current, [card.id]: card }; // Sync ref
      schedulePersist({ type: "put", card });
      setCardMapState((prev) => ({ ...prev, [card.id]: card }));
      bumpMapVersion();
      return card;
    },
    [setCardMapState],
  );

  const addFlashCard = useCallback(
    (question: string, answer: string, category: string, subcategory?: string) => {
      const card = createFlashCard(question, answer, category, subcategory);
      card.updatedAt = Date.now();
      cardMapRef.current = { ...cardMapRef.current, [card.id]: card }; // Sync ref
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
        subcategory?: string;
        chapter?: string;
        sourceId?: string;
        textAnchor?: string;
        originalSourceSnippet?: string;
        childCardIds?: string[];
        sourceModules?: SourceModule[];
        needsReview?: boolean;
      },
    ) => {
      patchCard(id, (c) => {
        const newCard = { ...c };
        if (updates.question) newCard.question = updates.question;
        if (updates.categoryId) newCard.categoryId = updates.categoryId;
        if (updates.subcategory !== undefined) newCard.subcategory = updates.subcategory;
        if (updates.chapter !== undefined) newCard.chapter = updates.chapter;
        if (updates.sourceId !== undefined) newCard.sourceId = updates.sourceId;
        if (updates.textAnchor !== undefined) newCard.textAnchor = updates.textAnchor;
        if (updates.originalSourceSnippet !== undefined) newCard.originalSourceSnippet = updates.originalSourceSnippet;
        if (updates.childCardIds !== undefined) newCard.childCardIds = updates.childCardIds;
        if (updates.sourceModules !== undefined) newCard.sourceModules = updates.sourceModules;
        if (updates.needsReview !== undefined) newCard.needsReview = updates.needsReview;
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

  // H5 fix: IDB delete with retry on failure
  const deleteCard = useCallback((id: string) => {
    const nextRef = { ...cardMapRef.current }; delete nextRef[id]; cardMapRef.current = nextRef;
    setCardMapState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    bumpMapVersion();
    idbDeleteCard(id).catch(e => {
      console.error("[deleteCard] IDB delete failed, retrying...", e);
      // Retry once after 1s
      setTimeout(() => idbDeleteCard(id).catch(e2 => console.error("[deleteCard] IDB retry also failed", e2)), 1000);
    });
    toast.success("Kartica obrisana.");
  }, [setCardMapState, cardMapRef]);

  // Split card — Ref-Delta: read from ref, pre-compute new cards, persist surgically
  const splitCard = useCallback((id: string) => {
    const card = cardMapRef.current![id];
    if (!card || card.sections.length <= 1) return;
    const newCards = card.sections.map(section => ({
      ...createCard(
        card.question,
        [{ title: section.title, content: section.content }],
        card.categoryId,
        card.subcategory,
      ),
      sections: [{ ...section }],
      updatedAt: Date.now(),
    }));
    // Sync ref before state update
    const nextRef = { ...cardMapRef.current }; delete nextRef[id]; newCards.forEach(c => { nextRef[c.id] = c; }); cardMapRef.current = nextRef;
    schedulePersist({ type: "bulk", cards: newCards });
    idbDeleteCard(id).catch(e => console.error("[splitCard] IDB delete failed", e));
    setCardMapState(prev => {
      const next = { ...prev };
      delete next[id];
      newCards.forEach(c => { next[c.id] = c; });
      return next;
    });
    bumpMapVersion();
  }, [setCardMapState, cardMapRef]);

  return { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard };
}
