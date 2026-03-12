import { useState, useCallback, useEffect, useMemo } from "react";
import { Card, createCard, createSection, calculateNextReview, getDueCards, getStats, getCategoryStats } from "@/lib/spaced-repetition";
import { loadCards, saveCards, loadCategories, saveCategories, addReviewLogEntry, loadReviewLog, ReviewLogEntry } from "@/lib/storage";

export function useCards() {
  const [cards, setCards] = useState<Card[]>(() => loadCards());
  const [categories, setCategories] = useState<string[]>(() => loadCategories());
  const [reviewLog, setReviewLog] = useState<ReviewLogEntry[]>(() => loadReviewLog());

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
        // Log the review
        const entry: ReviewLogEntry = {
          timestamp: Date.now(),
          cardId,
          sectionId,
          grade,
          category: c.category,
        };
        addReviewLogEntry(entry);
        setReviewLog((log) => [...log, entry]);

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

  const splitCard = useCallback((id: string) => {
    setCards((prev) => {
      const card = prev.find((c) => c.id === id);
      if (!card || card.sections.length <= 1) return prev;
      const newCards = card.sections.map((section) =>
        ({
          ...createCard(card.question, [{ title: section.title, content: section.content }], card.category),
          sections: [{ ...section }],
        })
      );
      return [...prev.filter((c) => c.id !== id), ...newCards];
    });
  }, []);

  const addCategory = useCallback((name: string) => {
    if (!categories.includes(name)) {
      setCategories((prev) => [...prev, name]);
    }
  }, [categories]);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    if (categories.includes(newName)) return;
    setCategories((prev) => prev.map((c) => (c === oldName ? newName : c)));
    setCards((prev) => prev.map((c) => (c.category === oldName ? { ...c, category: newName } : c)));
  }, [categories]);

  const deleteCategory = useCallback((name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    setCards((prev) => prev.map((c) => (c.category === name ? { ...c, category: "Opšte" } : c)));
  }, []);

  const markRead = useCallback((id: string) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, readCount: (c.readCount || 0) + 1 } : c));
  }, []);

  const exportData = useCallback(() => {
    const data = JSON.stringify({ cards, categories, reviewLog }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memoria-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cards, categories, reviewLog]);

  const importData = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (Array.isArray(parsed.cards)) {
          setCards(parsed.cards.map((c: any) => ({ ...c, readCount: c.readCount || 0 })));
        }
        if (Array.isArray(parsed.categories)) {
          setCategories(parsed.categories);
        }
        if (Array.isArray(parsed.reviewLog)) {
          setReviewLog(parsed.reviewLog);
        }
      } catch {
        alert("Greška pri čitanju fajla. Provjerite format.");
      }
    };
    reader.readAsText(file);
  }, []);

  const importCards = useCallback((newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
    const created = newCards.map((c) => createCard(c.question, c.sections, category));
    setCards((prev) => [...prev, ...created]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
  }, [categories]);

  const cardCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach((cat) => { counts[cat] = 0; });
    cards.forEach((c) => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return counts;
  }, [cards, categories]);

  const dueCards = getDueCards(cards);
  const stats = getStats(cards);
  const categoryStats = Object.fromEntries(
    categories.map((cat) => [cat, getCategoryStats(cards, cat)])
  );

  return {
    cards, categories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog,
    addCard, updateCard, deleteCard, splitCard, reviewSection, markRead,
    exportData, importData, importCards,
    addCategory, renameCategory, deleteCategory,
  };
}
