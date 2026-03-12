import { useState, useCallback, useEffect } from "react";
import { Card, createCard, createSection, calculateNextReview, getDueCards, getStats, getCategoryStats } from "@/lib/spaced-repetition";
import { loadCards, saveCards, loadCategories, saveCategories } from "@/lib/storage";

export function useCards() {
  const [cards, setCards] = useState<Card[]>(() => loadCards());
  const [categories, setCategories] = useState<string[]>(() => loadCategories());

  useEffect(() => { saveCards(cards); }, [cards]);
  useEffect(() => { saveCategories(categories); }, [categories]);

  const addCard = useCallback((question: string, sections: { title: string; content: string }[], category: string) => {
    const card = createCard(question, sections, category);
    setCards((prev) => [...prev, card]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
    return card;
  }, [categories]);

  const updateCard = useCallback((id: string, updates: { question?: string; sections?: { title: string; content: string }[]; category?: string }) => {
    setCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const newCard = { ...c };
      if (updates.question) newCard.question = updates.question;
      if (updates.category) newCard.category = updates.category;
      if (updates.sections) {
        // Preserve SR data for sections with matching titles, create new for others
        newCard.sections = updates.sections.map((s) => {
          const existing = c.sections.find((es) => es.title === s.title);
          if (existing) return { ...existing, content: s.content };
          return createSection(s.title, s.content);
        });
      }
      return newCard;
    }));
  }, []);

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const reviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    setCards((prev) =>
      prev.map((c) => {
        if (c.id !== cardId) return c;
        return {
          ...c,
          sections: c.sections.map((s) => {
            if (s.id !== sectionId) return s;
            return { ...s, ...calculateNextReview(s, grade) };
          }),
        };
      })
    );
  }, []);

  const addCategory = useCallback((name: string) => {
    if (!categories.includes(name)) {
      setCategories((prev) => [...prev, name]);
    }
  }, [categories]);

  const deleteCategory = useCallback((name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    setCards((prev) => prev.map((c) => (c.category === name ? { ...c, category: "Opšte" } : c)));
  }, []);

  const dueCards = getDueCards(cards);
  const stats = getStats(cards);
  const categoryStats = Object.fromEntries(
    categories.map((cat) => [cat, getCategoryStats(cards, cat)])
  );

  return {
    cards, categories, dueCards, stats, categoryStats,
    addCard, updateCard, deleteCard, reviewSection,
    addCategory, deleteCategory,
  };
}
