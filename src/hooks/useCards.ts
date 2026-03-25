import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  Card,
  calculateNextReview,
  getDueCards,
  getStats,
  getCategoryStats,
  SRSettings,
  DEFAULT_SR_SETTINGS,
} from "@/lib/spaced-repetition";
import { loadAppSettings } from "@/lib/app-settings";
import { ReviewLogEntry } from "@/lib/storage";
import { useCardExport } from "./useCardExport";
import { useCategoryManagement } from "./useCategoryManagement";
import { useCardImport } from "./useCardImport";
import { useCardCRUD } from "./useCardCRUD";
import { useCardBootstrap } from "./useCardBootstrap";
import { CardMap, mapToArray, persistQueue, schedulePersist } from "@/lib/persist-queue";
import {
  idbSaveCategories,
  idbSaveSubcategories,
  idbAddReviewLogEntry,
  idbSaveSettings,
} from "@/lib/db";

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categories, setCategoriesState] = useState<string[]>(["Opšte"]);
  const [subcategories, setSubcategoriesState] = useState<Record<string, string[]>>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);
  const cachedRetentionRef = useRef(loadAppSettings().targetRetention);

  // Flush pending actions on unmount to prevent data loss
  useEffect(() => {
    return () => { persistQueue.cleanup(); };
  }, []);

  // ── Boot (extracted module) ──
  const { ready } = useCardBootstrap({
    setCardMapState, setCategoriesState, setSubcategoriesState, setReviewLogState, setSrSettingsState,
  });

  // ── Derived: Card[] for consumers (memoized from map) ──
  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);

  // ── Bulk map update (for operations touching many cards) ──
  const setCardMap = useCallback((updater: (prev: CardMap) => CardMap, persist: "surgical" | "full" = "full") => {
    setCardMapState((prev) => {
      const next = updater(prev);
      if (persist === "full") {
        schedulePersist({ type: "full", map: next });
      }
      return next;
    });
  }, []);

  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    setCategoriesState((prev) => {
      const next = updater(prev);
      idbSaveCategories(next);
      return next;
    });
  }, []);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setSubcategoriesState((prev) => {
      const next = updater(prev);
      idbSaveSubcategories(next);
      return next;
    });
  }, []);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState((prev) => updater(prev));
  }, []);

  // ── Actions ──
  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  // ── CRUD (extracted module) ──
  const { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard } = useCardCRUD({
    categories, setCardMapState, setCategories, schedulePersist,
  });

  // O(1) review — surgical IDB write
  const reviewSection = useCallback(
    (cardId: string, sectionId: string, grade: number) => {
      const cachedRetention = cachedRetentionRef.current;
      patchCard(cardId, (c) => {
        const entry: ReviewLogEntry = { timestamp: Date.now(), cardId, sectionId, grade, category: c.category };
        idbAddReviewLogEntry(entry);
        setReviewLog((log) => [...log, entry]);

        let errorLog = c.errorLog;
        if (errorLog && errorLog.length > 0 && grade >= 3) {
          errorLog = errorLog.map((e) => ({
            ...e,
            recentSuccesses: (e.recentSuccesses || 0) + 1,
            successStreak: (e.successStreak || 0) + 1,
          }));
        } else if (errorLog && errorLog.length > 0 && grade === 1) {
          errorLog = errorLog.map((e) => ({ ...e, successStreak: 0 }));
        }

        return {
          ...c,
          ...(errorLog ? { errorLog } : {}),
          sections: c.sections.map((s) =>
            s.id !== sectionId ? s : { ...s, ...calculateNextReview(s, grade, cachedRetention) },
          ),
        };
      });
    },
    [patchCard, setReviewLog],
  );

  // O(1) markRead — surgical
  const markRead = useCallback(
    (id: string) => {
      patchCard(id, (c) => ({ ...c, readCount: (c.readCount || 0) + 1 }));
    },
    [patchCard],
  );

  // ── Category management (extracted module) ──
  const {
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    bulkUpdateSubcategory,
  } = useCategoryManagement({
    categories, setCategories, setSubcategories, setCardMap, setCardMapState, schedulePersist,
  });

  // Reorder cards by setting sortOrder based on array position
  const reorderCards = useCallback((orderedIds: string[]) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      orderedIds.forEach((id, index) => {
        if (next[id]) {
          next[id] = { ...next[id], sortOrder: index };
          updated.push(next[id]);
        }
      });
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, []);

  // Update chapter and chapterOrder for cards (used by Mental Skeleton DnD)
  const bulkUpdateChapter = useCallback((updates: { id: string; chapter: string; chapterOrder: number }[]) => {
    setCardMapState((prev) => {
      const next = { ...prev };
      const changed: Card[] = [];
      for (const u of updates) {
        if (next[u.id]) {
          next[u.id] = { ...next[u.id], chapter: u.chapter, chapterOrder: u.chapterOrder };
          changed.push(next[u.id]);
        }
      }
      schedulePersist({ type: "bulk", cards: changed });
      return next;
    });
  }, []);

  // O(1) toggleTag — surgical
  const toggleTag = useCallback(
    (cardId: string, tag: string) => {
      patchCard(cardId, (c) => {
        const tags = c.tags || [];
        return { ...c, tags: tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag] };
      });
    },
    [patchCard],
  );

  // O(1) logError — surgical
  const logError = useCallback(
    (cardId: string, text: string) => {
      patchCard(cardId, (c) => {
        const errorLog = [...(c.errorLog || [])];
        const existing = errorLog.find((e) => e.text === text);
        if (existing) {
          existing.count += 1;
          existing.lastMissed = new Date().toISOString();
          existing.successStreak = 0;
        } else {
          errorLog.push({
            text,
            count: 1,
            recentSuccesses: 0,
            successStreak: 0,
            category: c.category,
            lastMissed: new Date().toISOString(),
          });
        }
        const sections = c.sections.map((s) => ({
          ...s,
          difficulty: Math.min(10, s.difficulty + 0.5),
          stability: Math.max(0.1, s.stability * 0.85),
        }));
        return { ...c, errorLog, sections };
      });
    },
    [patchCard],
  );

  // O(1) clearErrorLog — surgical
  const clearErrorLog = useCallback(
    (cardId: string) => {
      patchCard(cardId, (c) => ({ ...c, errorLog: [] }));
    },
    [patchCard],
  );

  // O(1) toggleKeyPart — surgical: add if missing, remove if present
  const addKeyPart = useCallback(
    (cardId: string, text: string) => {
      patchCard(cardId, (c) => {
        const parts = c.keyParts || [];
        const normalized = text.trim();
        const existing = parts.findIndex((p) => p === normalized);
        if (existing >= 0) {
          return { ...c, keyParts: parts.filter((_, i) => i !== existing) };
        }
        return { ...c, keyParts: [...parts, normalized] };
      });
    },
    [patchCard],
  );

  // Bulk flag cards as needsReview (for source version updates)
  const bulkFlagNeedsReview = useCallback((cardIds: string[]) => {
    if (cardIds.length === 0) return;
    setCardMapState((prev) => {
      const next = { ...prev };
      const updated: Card[] = [];
      for (const id of cardIds) {
        if (next[id]) {
          next[id] = { ...next[id], needsReview: true };
          updated.push(next[id]);
        }
      }
      schedulePersist({ type: "bulk", cards: updated });
      return next;
    });
  }, []);

  // ── Export/Import (extracted to separate modules) ──
  const { exportData, exportTemplate } = useCardExport({ cards, categories, subcategories, reviewLog, srSettings });
  const { importData, importCards } = useCardImport({
    categories, setCardMap, setCategories, setSubcategories,
    setReviewLog: setReviewLogState, updateSRSettings,
    schedulePersist, setCardMapState,
  });

  // ── Derived data ──
  const cardCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    categories.forEach((cat) => { counts[cat] = 0; });
    cards.forEach((c) => { counts[c.category] = (counts[c.category] || 0) + 1; });
    return counts;
  }, [cards, categories]);

  const dueCards = useMemo(() => getDueCards(cards), [cards]);
  const stats = useMemo(() => getStats(cards), [cards]);
  const categoryStats = useMemo(
    () => Object.fromEntries(categories.map((cat) => [cat, getCategoryStats(cards, cat)])),
    [cards, categories],
  );

  const reorderCategories = useCallback((ordered: string[]) => {
    setCategoriesState(ordered);
    idbSaveCategories(ordered);
  }, []);

  const reorderSubcategories = useCallback((category: string, ordered: string[]) => {
    setSubcategoriesState((prev) => {
      const next = { ...prev, [category]: ordered };
      idbSaveSubcategories(next);
      return next;
    });
  }, []);

  return {
    cards,
    categories,
    subcategories,
    dueCards,
    stats,
    categoryStats,
    cardCountByCategory,
    reviewLog,
    srSettings,
    ready,
    addCard,
    addFlashCard,
    updateCard,
    deleteCard,
    splitCard,
    reviewSection,
    markRead,
    toggleTag,
    addKeyPart,
    bulkFlagNeedsReview,
    bulkUpdateSubcategory,
    bulkUpdateChapter,
    reorderCards,
    logError,
    clearErrorLog,
    exportData,
    exportTemplate,
    importData,
    importCards,
    addCategory,
    renameCategory,
    deleteCategory,
    addSubcategory,
    renameSubcategory,
    deleteSubcategory,
    reorderCategories,
    reorderSubcategories,
    updateSRSettings,
  };
}
