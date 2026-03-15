import { useCallback, useMemo } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Card, createCard, createFlashCard, createSection, calculateNextReview, getDueCards, getStats, getCategoryStats, SRSettings, DEFAULT_SR_SETTINGS, ErrorLogEntry } from "@/lib/spaced-repetition";
import { loadCards, saveCards, loadCategories, saveCategories, loadSubcategories, saveSubcategories, addReviewLogEntry, loadReviewLog, ReviewLogEntry, loadSRSettings, saveSRSettings, setLastBackupTime } from "@/lib/storage";

// Query keys
const KEYS = {
  cards: ["cards"] as const,
  categories: ["categories"] as const,
  subcategories: ["subcategories"] as const,
  reviewLog: ["reviewLog"] as const,
  srSettings: ["srSettings"] as const,
};

// Generic hook for localStorage-backed query + mutations
function useLocalQuery<T>(key: readonly string[], loader: () => T) {
  return useQuery({ queryKey: key, queryFn: loader, staleTime: Infinity, gcTime: Infinity });
}

export function useCards() {
  const qc = useQueryClient();

  // Queries
  const { data: cards = [] } = useLocalQuery(KEYS.cards, loadCards);
  const { data: categories = ["Opšte"] } = useLocalQuery(KEYS.categories, loadCategories);
  const { data: subcategories = {} } = useLocalQuery(KEYS.subcategories, loadSubcategories);
  const { data: reviewLog = [] } = useLocalQuery(KEYS.reviewLog, loadReviewLog);
  const { data: srSettings = DEFAULT_SR_SETTINGS } = useLocalQuery(KEYS.srSettings, loadSRSettings);

  // Helpers to update cache + persist
  const setCards = useCallback((updater: (prev: Card[]) => Card[]) => {
    qc.setQueryData<Card[]>(KEYS.cards, (old) => {
      const next = updater(old || []);
      saveCards(next);
      return next;
    });
  }, [qc]);

  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    qc.setQueryData<string[]>(KEYS.categories, (old) => {
      const next = updater(old || ["Opšte"]);
      saveCategories(next);
      return next;
    });
  }, [qc]);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    qc.setQueryData<Record<string, string[]>>(KEYS.subcategories, (old) => {
      const next = updater(old || {});
      saveSubcategories(next);
      return next;
    });
  }, [qc]);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    qc.setQueryData<ReviewLogEntry[]>(KEYS.reviewLog, (old) => {
      const next = updater(old || []);
      return next;
    });
  }, [qc]);

  // Actions
  const updateSRSettings = useCallback((settings: SRSettings) => {
    qc.setQueryData(KEYS.srSettings, settings);
    saveSRSettings(settings);
  }, [qc]);

  const addCard = useCallback((question: string, sections: { title: string; content: string }[], category: string, subcategory?: string) => {
    const card = createCard(question, sections, category, subcategory);
    setCards((prev) => [...prev, card]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
    return card;
  }, [categories, setCards, setCategories]);

  const addFlashCard = useCallback((question: string, answer: string, category: string, subcategory?: string) => {
    const card = createFlashCard(question, answer, category, subcategory);
    setCards((prev) => [...prev, card]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
    return card;
  }, [categories, setCards, setCategories]);

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
  }, [setCards]);

  const deleteCard = useCallback((id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }, [setCards]);

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
  }, [setCards, setReviewLog]);

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
  }, [setCards]);

  const addCategory = useCallback((name: string) => {
    if (!categories.includes(name)) {
      setCategories((prev) => [...prev, name]);
    }
  }, [categories, setCategories]);

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
  }, [categories, setCategories, setCards, setSubcategories]);

  const deleteCategory = useCallback((name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
    setCards((prev) => prev.map((c) => (c.category === name ? { ...c, category: "Opšte", subcategory: "" } : c)));
    setSubcategories((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, [setCategories, setCards, setSubcategories]);

  const addSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories((prev) => {
      const list = prev[category] || [];
      if (list.includes(subcategory)) return prev;
      return { ...prev, [category]: [...list, subcategory] };
    });
  }, [setSubcategories]);

  const renameSubcategory = useCallback((category: string, oldName: string, newName: string) => {
    setSubcategories((prev) => {
      const list = prev[category] || [];
      if (list.includes(newName)) return prev;
      return { ...prev, [category]: list.map((s) => (s === oldName ? newName : s)) };
    });
    setCards((prev) => prev.map((c) =>
      c.category === category && c.subcategory === oldName ? { ...c, subcategory: newName } : c
    ));
  }, [setSubcategories, setCards]);

  const deleteSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories((prev) => {
      const list = prev[category] || [];
      return { ...prev, [category]: list.filter((s) => s !== subcategory) };
    });
    setCards((prev) => prev.map((c) =>
      c.category === category && c.subcategory === subcategory ? { ...c, subcategory: "" } : c
    ));
  }, [setSubcategories, setCards]);

  const markRead = useCallback((id: string) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, readCount: (c.readCount || 0) + 1 } : c));
  }, [setCards]);

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    setCards((prev) => prev.map((c) => {
      if (!ids.includes(c.id)) return c;
      return { ...c, subcategory };
    }));
  }, [setCards]);

  const toggleTag = useCallback((cardId: string, tag: string) => {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      const tags = c.tags || [];
      if (tags.includes(tag)) {
        return { ...c, tags: tags.filter((t) => t !== tag) };
      }
      return { ...c, tags: [...tags, tag] };
    }));
  }, [setCards]);

  const logError = useCallback((cardId: string, text: string) => {
    setCards((prev) => prev.map((c) => {
      if (c.id !== cardId) return c;
      const errorLog = [...(c.errorLog || [])];
      const existing = errorLog.find((e) => e.text === text);
      if (existing) {
        existing.count += 1;
        existing.lastMissed = new Date().toISOString();
      } else {
        errorLog.push({ text, count: 1, category: c.category, lastMissed: new Date().toISOString() });
      }
      // Adjust FSRS: increase difficulty, reduce stability on all sections
      const sections = c.sections.map((s) => ({
        ...s,
        difficulty: Math.min(10, s.difficulty + 0.5),
        stability: Math.max(0.1, s.stability * 0.85),
      }));
      return { ...c, errorLog, sections };
    }));
  }, [setCards]);

  const exportData = useCallback(() => {
    const data = JSON.stringify({ cards, categories, subcategories, reviewLog, srSettings }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memoria-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLastBackupTime();
  }, [cards, categories, subcategories, reviewLog, srSettings]);

  const importData = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (Array.isArray(parsed.cards)) {
          const imported = parsed.cards.map((c: any) => ({
            ...c,
            readCount: c.readCount || 0,
            type: c.type || "essay",
            subcategory: c.subcategory || "",
            tags: c.tags || [],
            sections: (c.sections || []).map((s: any) => ({
              ...s,
              state: s.state ?? 0,
              lapses: s.lapses || 0,
              stability: s.stability ?? 0,
              difficulty: s.difficulty ?? 5,
              elapsedDays: s.elapsedDays ?? 0,
              scheduledDays: s.scheduledDays ?? 0,
            })),
          }));
          qc.setQueryData(KEYS.cards, imported);
          saveCards(imported);
        }
        if (Array.isArray(parsed.categories)) {
          qc.setQueryData(KEYS.categories, parsed.categories);
          saveCategories(parsed.categories);
        }
        if (parsed.subcategories && typeof parsed.subcategories === "object") {
          qc.setQueryData(KEYS.subcategories, parsed.subcategories);
          saveSubcategories(parsed.subcategories);
        }
        if (Array.isArray(parsed.reviewLog)) {
          qc.setQueryData(KEYS.reviewLog, parsed.reviewLog);
        }
        if (parsed.srSettings) {
          updateSRSettings({ ...DEFAULT_SR_SETTINGS, ...parsed.srSettings });
        }
      } catch {
        alert("Greška pri čitanju fajla. Provjerite format.");
      }
    };
    reader.readAsText(file);
  }, [qc, updateSRSettings]);

  const importCards = useCallback((newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
    const created = newCards.map((c) => createCard(c.question, c.sections, category));
    setCards((prev) => [...prev, ...created]);
    if (!categories.includes(category)) {
      setCategories((prev) => [...prev, category]);
    }
  }, [categories, setCards, setCategories]);

  // Derived data
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
    addCard, addFlashCard, updateCard, deleteCard, splitCard, reviewSection, markRead, toggleTag, bulkUpdateSubcategory, logError,
    exportData, importData, importCards,
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    updateSRSettings,
  };
}
