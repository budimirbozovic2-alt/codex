import { useState, useCallback, useEffect, useMemo } from "react";
import { Card, createCard, createFlashCard, createSection, calculateNextReview, getDueCards, getStats, getCategoryStats, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { loadCards, saveCards, loadCategories, saveCategories, loadSubcategories, saveSubcategories, addReviewLogEntry, loadReviewLog, ReviewLogEntry, loadSRSettings, saveSRSettings } from "@/lib/storage";

export function useCards() {
  const [cards, setCards] = useState<Card[]>(() => loadCards());
  const [categories, setCategories] = useState<string[]>(() => loadCategories());
  const [subcategories, setSubcategories] = useState<Record<string, string[]>>(() => loadSubcategories());
  const [reviewLog, setReviewLog] = useState<ReviewLogEntry[]>(() => loadReviewLog());
  const [srSettings, setSRSettings] = useState<SRSettings>(() => loadSRSettings());

  useEffect(() => { saveCards(cards); }, [cards]);
  useEffect(() => { saveCategories(categories); }, [categories]);
  useEffect(() => { saveSubcategories(subcategories); }, [subcategories]);

  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSRSettings(settings);
    saveSRSettings(settings);
  }, []);

  const addCard = useCallback((question: string, sections: { title: string; content: string }[], category: string, subcategory?: string) => {
    const card = createCard(question, sections, category, subcategory);
    setCards((prev) => [...prev, card]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
    return card;
  }, [categories]);

  const addFlashCard = useCallback((question: string, answer: string, category: string, subcategory?: string) => {
    const card = createFlashCard(question, answer, category, subcategory);
    setCards((prev) => [...prev, card]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
    return card;
  }, [categories]);

  const updateCard = useCallback((id: string, updates: { question?: string; sections?: { title: string; content: string }[]; category?: string; subcategory?: string }) => {
    setCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      const newCard = { ...c };
      if (updates.question) newCard.question = updates.question;
      if (updates.category) newCard.category = updates.category;
      if (updates.subcategory !== undefined) newCard.subcategory = updates.subcategory;
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
          ...createCard(card.question, [{ title: section.title, content: section.content }], card.category, card.subcategory),
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
    setSubcategories((prev) => {
      const next = { ...prev };
      if (next[oldName]) {
        next[newName] = next[oldName];
        delete next[oldName];
      }
      return next;
    });
  }, [categories]);

  const deleteCategory = useCallback((name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    setCards((prev) => prev.map((c) => (c.category === name ? { ...c, category: "Opšte", subcategory: "" } : c)));
    setSubcategories((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const addSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories((prev) => {
      const list = prev[category] || [];
      if (list.includes(subcategory)) return prev;
      return { ...prev, [category]: [...list, subcategory] };
    });
  }, []);

  const renameSubcategory = useCallback((category: string, oldName: string, newName: string) => {
    setSubcategories((prev) => {
      const list = prev[category] || [];
      if (list.includes(newName)) return prev;
      return { ...prev, [category]: list.map((s) => (s === oldName ? newName : s)) };
    });
    setCards((prev) => prev.map((c) =>
      c.category === category && c.subcategory === oldName ? { ...c, subcategory: newName } : c
    ));
  }, []);

  const deleteSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories((prev) => {
      const list = prev[category] || [];
      return { ...prev, [category]: list.filter((s) => s !== subcategory) };
    });
    setCards((prev) => prev.map((c) =>
      c.category === category && c.subcategory === subcategory ? { ...c, subcategory: "" } : c
    ));
  }, []);

  const markRead = useCallback((id: string) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, readCount: (c.readCount || 0) + 1 } : c));
  }, []);

  const exportData = useCallback(() => {
    const data = JSON.stringify({ cards, categories, subcategories, reviewLog, srSettings }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memoria-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cards, categories, subcategories, reviewLog, srSettings]);

  const importData = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (Array.isArray(parsed.cards)) {
          setCards(parsed.cards.map((c: any) => ({
            ...c,
            readCount: c.readCount || 0,
            type: c.type || "essay",
            subcategory: c.subcategory || "",
            sections: (c.sections || []).map((s: any) => ({
              ...s,
              lapses: s.lapses || 0,
              stability: s.stability ?? 0,
              difficulty: s.difficulty ?? 5,
            })),
          })));
        }
        if (Array.isArray(parsed.categories)) {
          setCategories(parsed.categories);
        }
        if (parsed.subcategories && typeof parsed.subcategories === "object") {
          setSubcategories(parsed.subcategories);
        }
        if (Array.isArray(parsed.reviewLog)) {
          setReviewLog(parsed.reviewLog);
        }
        if (parsed.srSettings) {
          updateSRSettings({ ...DEFAULT_SR_SETTINGS, ...parsed.srSettings });
        }
      } catch {
        alert("Greška pri čitanju fajla. Provjerite format.");
      }
    };
    reader.readAsText(file);
  }, [updateSRSettings]);

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
    cards, categories, subcategories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog, srSettings,
    addCard, addFlashCard, updateCard, deleteCard, splitCard, reviewSection, markRead,
    exportData, importData, importCards,
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    updateSRSettings,
  };
}
