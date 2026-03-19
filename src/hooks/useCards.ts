import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import { Card, createCard, createFlashCard, createSection, calculateNextReview, getDueCards, getStats, getCategoryStats, SRSettings, DEFAULT_SR_SETTINGS, ErrorLogEntry } from "@/lib/spaced-repetition";
import { ReviewLogEntry, setLastBackupTime } from "@/lib/storage";
import {
  migrateFromLocalStorage,
  idbLoadCards, idbSaveCards,
  idbLoadCategories, idbSaveCategories,
  idbLoadSubcategories, idbSaveSubcategories,
  idbLoadReviewLog, idbAddReviewLogEntry,
  idbLoadSettings, idbSaveSettings,
} from "@/lib/db";

// ─── Internal Map type for O(1) access ──────────────────
type CardMap = Record<string, Card>;

function arrayToMap(cards: Card[]): CardMap {
  const map: CardMap = {};
  for (const c of cards) map[c.id] = c;
  return map;
}

function mapToArray(map: CardMap): Card[] {
  return Object.values(map);
}

function persistCards(map: CardMap) {
  idbSaveCards(mapToArray(map));
}

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categories, setCategoriesState] = useState<string[]>(["Opšte"]);
  const [subcategories, setSubcategoriesState] = useState<Record<string, string[]>>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);

  // ── Initial async load from IndexedDB ──
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    (async () => {
      await migrateFromLocalStorage();
      const [c, cats, subs, log, settings] = await Promise.all([
        idbLoadCards(),
        idbLoadCategories(),
        idbLoadSubcategories(),
        idbLoadReviewLog(),
        idbLoadSettings<SRSettings>("srSettings", DEFAULT_SR_SETTINGS),
      ]);
      setCardMapState(arrayToMap(c));
      setCategoriesState(cats);
      setSubcategoriesState(subs);
      setReviewLogState(log);
      setSrSettingsState(settings);
      setReady(true);
    })();
  }, []);

  // ── Derived: Card[] for consumers (memoized from map) ──
  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);

  // ── Helpers: update map + persist async ──
  const setCardMap = useCallback((updater: (prev: CardMap) => CardMap) => {
    setCardMapState(prev => {
      const next = updater(prev);
      persistCards(next);
      return next;
    });
  }, []);

  // O(1) update a single card by ID
  const patchCard = useCallback((id: string, patcher: (card: Card) => Card) => {
    setCardMap(prev => {
      const card = prev[id];
      if (!card) return prev;
      return { ...prev, [id]: patcher(card) };
    });
  }, [setCardMap]);

  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    setCategoriesState(prev => {
      const next = updater(prev);
      idbSaveCategories(next);
      return next;
    });
  }, []);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setSubcategoriesState(prev => {
      const next = updater(prev);
      idbSaveSubcategories(next);
      return next;
    });
  }, []);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState(prev => updater(prev));
  }, []);

  // ── Actions ──
  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  const addCard = useCallback((question: string, sections: { title: string; content: string }[], category: string, subcategory?: string) => {
    const card = createCard(question, sections, category, subcategory);
    setCardMap(prev => ({ ...prev, [card.id]: card }));
    if (!categories.includes(category)) {
      setCategories(prev => [...prev, category]);
    }
    return card;
  }, [categories, setCardMap, setCategories]);

  const addFlashCard = useCallback((question: string, answer: string, category: string, subcategory?: string) => {
    const card = createFlashCard(question, answer, category, subcategory);
    setCardMap(prev => ({ ...prev, [card.id]: card }));
    if (!categories.includes(category)) {
      setCategories(prev => [...prev, category]);
    }
    return card;
  }, [categories, setCardMap, setCategories]);

  // O(1) direct update
  const updateCard = useCallback((id: string, updates: { question?: string; sections?: { title: string; content: string }[]; category?: string; subcategory?: string }) => {
    patchCard(id, c => {
      const newCard = { ...c };
      if (updates.question) newCard.question = updates.question;
      if (updates.category) newCard.category = updates.category;
      if (updates.subcategory !== undefined) newCard.subcategory = updates.subcategory;
      if (updates.sections) {
        newCard.sections = updates.sections.map(s => {
          const existing = c.sections.find(es => es.title === s.title);
          if (existing) return { ...existing, content: s.content };
          return createSection(s.title, s.content);
        });
      }
      return newCard;
    });
  }, [patchCard]);

  // O(1) delete
  const deleteCard = useCallback((id: string) => {
    setCardMap(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [setCardMap]);

  // O(1) review
  const reviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    patchCard(cardId, c => {
      const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: c.category };
      idbAddReviewLogEntry(entry);
      setReviewLog(log => [...log, entry]);

      let errorLog = c.errorLog;
      if (errorLog && errorLog.length > 0 && grade >= 3) {
        errorLog = errorLog.map(e => ({ ...e, recentSuccesses: (e.recentSuccesses || 0) + 1, successStreak: (e.successStreak || 0) + 1 }));
      } else if (errorLog && errorLog.length > 0 && grade === 1) {
        errorLog = errorLog.map(e => ({ ...e, successStreak: 0 }));
      }

      return {
        ...c,
        ...(errorLog ? { errorLog } : {}),
        sections: c.sections.map(s => s.id !== sectionId ? s : { ...s, ...calculateNextReview(s, grade) }),
      };
    });
  }, [patchCard, setReviewLog]);

  const splitCard = useCallback((id: string) => {
    setCardMap(prev => {
      const card = prev[id];
      if (!card || card.sections.length <= 1) return prev;
      const next = { ...prev };
      delete next[id];
      card.sections.forEach(section => {
        const newCard = { ...createCard(card.question, [{ title: section.title, content: section.content }], card.category, card.subcategory), sections: [{ ...section }] };
        next[newCard.id] = newCard;
      });
      return next;
    });
  }, [setCardMap]);

  const addCategory = useCallback((name: string) => {
    if (!categories.includes(name)) setCategories(prev => [...prev, name]);
  }, [categories, setCategories]);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    if (categories.includes(newName)) return;
    setCategories(prev => prev.map(c => c === oldName ? newName : c));
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === oldName ? { ...c, category: newName } : c;
      }
      return next;
    });
    setSubcategories(prev => {
      const next = { ...prev };
      if (next[oldName]) { next[newName] = next[oldName]; delete next[oldName]; }
      return next;
    });
  }, [categories, setCategories, setCardMap, setSubcategories]);

  const deleteCategory = useCallback((name: string) => {
    setCategories(prev => prev.filter(c => c !== name));
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === name ? { ...c, category: "Opšte", subcategory: "" } : c;
      }
      return next;
    });
    setSubcategories(prev => { const next = { ...prev }; delete next[name]; return next; });
  }, [setCategories, setCardMap, setSubcategories]);

  const addSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories(prev => {
      const list = prev[category] || [];
      if (list.includes(subcategory)) return prev;
      return { ...prev, [category]: [...list, subcategory] };
    });
  }, [setSubcategories]);

  const renameSubcategory = useCallback((category: string, oldName: string, newName: string) => {
    setSubcategories(prev => {
      const list = prev[category] || [];
      if (list.includes(newName)) return prev;
      return { ...prev, [category]: list.map(s => s === oldName ? newName : s) };
    });
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === category && c.subcategory === oldName ? { ...c, subcategory: newName } : c;
      }
      return next;
    });
  }, [setSubcategories, setCardMap]);

  const deleteSubcategory = useCallback((category: string, subcategory: string) => {
    setSubcategories(prev => ({ ...prev, [category]: (prev[category] || []).filter(s => s !== subcategory) }));
    setCardMap(prev => {
      const next: CardMap = {};
      for (const [id, c] of Object.entries(prev)) {
        next[id] = c.category === category && c.subcategory === subcategory ? { ...c, subcategory: "" } : c;
      }
      return next;
    });
  }, [setSubcategories, setCardMap]);

  // O(1) markRead
  const markRead = useCallback((id: string) => {
    patchCard(id, c => ({ ...c, readCount: (c.readCount || 0) + 1 }));
  }, [patchCard]);

  const bulkUpdateSubcategory = useCallback((ids: string[], subcategory: string) => {
    setCardMap(prev => {
      const next = { ...prev };
      for (const id of ids) {
        if (next[id]) next[id] = { ...next[id], subcategory };
      }
      return next;
    });
  }, [setCardMap]);

  // O(1) toggleTag
  const toggleTag = useCallback((cardId: string, tag: string) => {
    patchCard(cardId, c => {
      const tags = c.tags || [];
      return { ...c, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
  }, [patchCard]);

  // O(1) logError
  const logError = useCallback((cardId: string, text: string) => {
    patchCard(cardId, c => {
      const errorLog = [...(c.errorLog || [])];
      const existing = errorLog.find(e => e.text === text);
      if (existing) {
        existing.count += 1;
        existing.lastMissed = new Date().toISOString();
        existing.successStreak = 0;
      } else {
        errorLog.push({ text, count: 1, recentSuccesses: 0, successStreak: 0, category: c.category, lastMissed: new Date().toISOString() });
      }
      const sections = c.sections.map(s => ({ ...s, difficulty: Math.min(10, s.difficulty + 0.5), stability: Math.max(0.1, s.stability * 0.85) }));
      return { ...c, errorLog, sections };
    });
  }, [patchCard]);

  // O(1) clearErrorLog
  const clearErrorLog = useCallback((cardId: string) => {
    patchCard(cardId, c => ({ ...c, errorLog: [] }));
  }, [patchCard]);

  const downloadJson = useCallback((data: object, filename: string) => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportTemplate = useCallback(() => {
    const templateCards = cards.map(c => ({
      id: c.id, question: c.question,
      sections: c.sections.map(s => ({ title: s.title, content: s.content })),
      category: c.category, subcategory: c.subcategory || "", type: c.type, tags: c.tags || [],
    }));
    downloadJson({ version: 2, type: "template", cards: templateCards, categories, subcategories },
      `memoria-template-${new Date().toISOString().slice(0, 10)}.json`);
  }, [cards, categories, subcategories, downloadJson]);

  const exportData = useCallback(() => {
    downloadJson({ version: 2, type: "full", cards, categories, subcategories, reviewLog, srSettings },
      `memoria-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setLastBackupTime();
  }, [cards, categories, subcategories, reviewLog, srSettings, downloadJson]);

  const importData = useCallback((file: File, strategy: "keep" | "overwrite" | "skip" | "newer" = "skip") => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (Array.isArray(parsed.cards)) {
          const migrateImported = (c: any): Card => ({
            ...c, readCount: c.readCount || 0, type: c.type || "essay", subcategory: c.subcategory || "",
            tags: c.tags || [], errorLog: c.errorLog || [],
            sections: (c.sections || []).map((s: any) => ({
              ...s, id: s.id || crypto.randomUUID(), state: s.state ?? 0, lapses: s.lapses || 0,
              stability: s.stability ?? 0, difficulty: s.difficulty ?? 5, interval: s.interval ?? 0,
              nextReview: s.nextReview ?? 0, lastReviewed: s.lastReviewed ?? null,
              elapsedDays: s.elapsedDays ?? 0, scheduledDays: s.scheduledDays ?? 0,
            })),
          });

          const importedCards: Card[] = parsed.cards.map(migrateImported);
          setCardMap(prev => {
            const next = { ...prev };
            if (strategy === "newer") {
              const getLastReview = (c: Card) => Math.max(0, ...c.sections.map(s => s.lastReviewed || 0));
              importedCards.forEach(ic => {
                const existing = next[ic.id];
                if (!existing) { next[ic.id] = ic; }
                else if (getLastReview(ic) > getLastReview(existing)) { next[ic.id] = ic; }
              });
            } else if (strategy === "overwrite") {
              importedCards.forEach(ic => { next[ic.id] = ic; });
            } else {
              importedCards.forEach(ic => { if (!next[ic.id]) next[ic.id] = ic; });
            }
            return next;
          });
        }
        if (Array.isArray(parsed.categories)) {
          setCategories(prev => [...new Set([...prev, ...parsed.categories])]);
        }
        if (parsed.subcategories && typeof parsed.subcategories === "object") {
          setSubcategories(prev => {
            const merged = { ...prev };
            for (const [cat, subs] of Object.entries(parsed.subcategories as Record<string, string[]>)) {
              merged[cat] = [...new Set([...(merged[cat] || []), ...subs])];
            }
            return merged;
          });
        }
        if (Array.isArray(parsed.reviewLog) && strategy === "overwrite") {
          setReviewLogState(parsed.reviewLog);
        }
        if (parsed.srSettings && strategy === "overwrite") {
          updateSRSettings({ ...DEFAULT_SR_SETTINGS, ...parsed.srSettings });
        }
      } catch {
        alert("Greška pri čitanju fajla. Provjerite format.");
      }
    };
    reader.readAsText(file);
  }, [setCardMap, setCategories, setSubcategories, updateSRSettings]);

  const importCards = useCallback((newCards: { question: string; sections: { title: string; content: string }[] }[], category: string) => {
    const created = newCards.map(c => createCard(c.question, c.sections, category));
    setCardMap(prev => {
      const next = { ...prev };
      created.forEach(c => { next[c.id] = c; });
      return next;
    });
    if (!categories.includes(category)) setCategories(prev => [...prev, category]);
  }, [categories, setCardMap, setCategories]);

  // ── Derived data ──
  const cardCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach(cat => { counts[cat] = 0; });
    cards.forEach(c => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return counts;
  }, [cards, categories]);

  const dueCards = useMemo(() => getDueCards(cards), [cards]);
  const stats = useMemo(() => getStats(cards), [cards]);
  const categoryStats = useMemo(() =>
    Object.fromEntries(categories.map(cat => [cat, getCategoryStats(cards, cat)])),
    [cards, categories]
  );

  return {
    cards, categories, subcategories, dueCards, stats, categoryStats, cardCountByCategory, reviewLog, srSettings, ready,
    addCard, addFlashCard, updateCard, deleteCard, splitCard, reviewSection, markRead, toggleTag, bulkUpdateSubcategory, logError, clearErrorLog,
    exportData, exportTemplate, importData, importCards,
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    updateSRSettings,
  };
}
