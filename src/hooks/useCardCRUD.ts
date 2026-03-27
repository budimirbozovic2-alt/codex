import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
  Card,
  createCard,
  createFlashCard,
  createSection,
  SourceModule,
} from "@/lib/spaced-repetition";
import { CardMap, bumpMapVersion } from "@/lib/persist-queue";

interface UseCardCRUDParams {
  categories: string[];
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  setCategories: (updater: (prev: string[]) => string[]) => void;
}

export function useCardCRUD({
  categories,
  setCardMapState,
  setCategories,
}: UseCardCRUDParams) {
  // Keep a ref to categories to avoid stale closures in addCard/addFlashCard
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;

  // ── Surgical single-card update (O(1) state + O(1) IDB) ──
  const patchCard = useCallback((id: string, patcher: (card: Card) => Card) => {
    setCardMapState((prev) => {
      const card = prev[id];
      if (!card) return prev;
      const updated = { ...patcher(card), updatedAt: Date.now() };
      return { ...prev, [id]: updated };
    });
    bumpMapVersion();
  }, [setCardMapState]);

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
      setCardMapState((prev) => {
        return { ...prev, [card.id]: card };
      });
      bumpMapVersion();
      schedulePersist({ type: "put", card });
      if (!categoriesRef.current.includes(category)) {
        setCategories((prev) => [...prev, category]);
      }
      return card;
    },
    [setCategories, setCardMapState, schedulePersist],
  );

  const addFlashCard = useCallback(
    (question: string, answer: string, category: string, subcategory?: string) => {
      const card = createFlashCard(question, answer, category, subcategory);
      card.updatedAt = Date.now();
      setCardMapState((prev) => {
        return { ...prev, [card.id]: card };
      });
      bumpMapVersion();
      schedulePersist({ type: "put", card });
      if (!categoriesRef.current.includes(category)) {
        setCategories((prev) => [...prev, category]);
      }
      return card;
    },
    [setCategories, setCardMapState, schedulePersist],
  );

  // O(1) direct update — surgical IDB write
  const updateCard = useCallback(
    (
      id: string,
      updates: {
        question?: string;
        sections?: { title: string; content: string }[];
        category?: string;
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
        if (updates.category) newCard.category = updates.category;
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

  // O(1) delete — surgical IDB delete
  const deleteCard = useCallback((id: string) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    bumpMapVersion();
    schedulePersist({ type: "delete", id });
    toast.success("Kartica obrisana.");
  }, [setCardMapState, schedulePersist]);

  const splitCard = useCallback((id: string) => {
    let newCards: Card[] = [];
    setCardMapState((prev) => {
      const card = prev[id];
      if (!card || card.sections.length <= 1) return prev;
      const next = { ...prev };
      delete next[id];
      card.sections.forEach((section) => {
        const newCard = {
          ...createCard(
            card.question,
            [{ title: section.title, content: section.content }],
            card.category,
            card.subcategory,
          ),
          sections: [{ ...section }],
          updatedAt: Date.now(),
        };
        next[newCard.id] = newCard;
        newCards.push(newCard);
      });
      return next;
    });
    bumpMapVersion();
    if (newCards.length > 0) {
      schedulePersist({ type: "delete", id });
      schedulePersist({ type: "bulk", cards: newCards });
    }
  }, [setCardMapState, schedulePersist]);

  return { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard };
}
