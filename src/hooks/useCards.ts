import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  Card,
  SRSettings,
  DEFAULT_SR_SETTINGS,
  SectionState,
  isLeech,
  getSectionScore,
} from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { useCardExport } from "./useCardExport";
import { useCategoryManagement } from "./useCategoryManagement";
import { useCardImport } from "./useCardImport";
import { useCardCRUD } from "./useCardCRUD";
import { useCardBootstrap } from "./useCardBootstrap";
import { useCardAnnotations } from "./useCardAnnotations";
import { CardMap, mapToArray, persistQueue, schedulePersist, bumpMapVersion } from "@/lib/persist-queue";
import {
  idbSaveSettings,
  idbLoadCategories,
  idbSaveCategories,
  type CategoryRecord,
} from "@/lib/db";
import { onCardLinksCleared } from "@/lib/sources-storage";

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categories, setCategoriesState] = useState<string[]>([]);
  const [categoryRecords, setCategoryRecordsState] = useState<CategoryRecord[]>([]);
  const [subcategories, setSubcategoriesState] = useState<Record<string, string[]>>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  // Flush pending actions on unmount to prevent data loss
  useEffect(() => {
    return () => { persistQueue.cleanup(); };
  }, []);

  // ── Boot (extracted module) ──
  const { ready: bootstrapReady, dbError } = useCardBootstrap({
    setCardMapState, setCategoriesState, setCategoryRecordsState, setSubcategoriesState, setReviewLogState, setSrSettingsState,
  });

  // ── Force-ready safety net: if bootstrap hangs, unlock UI after 5s ──
  const [forceReady, setForceReady] = useState(false);
  useEffect(() => {
    if (bootstrapReady) return;
    const timer = setTimeout(() => {
      console.warn("[useCards] forceReady triggered after 5s");
      setForceReady(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [bootstrapReady]);

  const ready = bootstrapReady || forceReady;

  // ── Derived: Card[] for consumers (memoized from map) ──
  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);

  // ── Ref-Delta: cardMapRef mirrors state for synchronous reads in action handlers ──
  const cardMapRef = useRef<CardMap>({});
  useEffect(() => { cardMapRef.current = cardMap; }, [cardMap]);

  // ── F5 fix: Sync in-memory cardMap when deleteSource clears card links ──
  useEffect(() => {
    return onCardLinksCleared((clearedIds) => {
      setCardMapState(prev => {
        const next = { ...prev };
        let changed = false;
        for (const id of clearedIds) {
          if (next[id]?.sourceId) {
            next[id] = { ...next[id], sourceId: undefined, textAnchor: undefined, needsReview: undefined };
            changed = true;
          }
        }
        if (changed) {
          cardMapRef.current = next;
          return next;
        }
        return prev;
      });
    });
  }, []);

  // Save categories: convert string[] names to CategoryRecord[] for IDB
  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    setCategoriesState(prev => {
      const next = updater(prev);
      if (next !== prev) {
        // Async save: load existing records, update names/order
        (async () => {
          try {
            const existing = await idbLoadCategories();
            const byName = new Map(existing.map(c => [c.name, c]));
            const records: CategoryRecord[] = next.map((name, i) => {
              const rec = byName.get(name);
              return rec
                ? { ...rec, sortOrder: i }
                : { id: crypto.randomUUID(), name, sortOrder: i, subcategories: [] };
            });
            await idbSaveCategories(records);
          } catch (e) { console.error("[useCards] category save failed", e); }
        })();
      }
      return next;
    });
  }, []);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setSubcategoriesState(prev => {
      const next = updater(prev);
      // Persist subcategories to CategoryRecord.subcategories
      if (next !== prev) {
        (async () => {
          try {
            const existing = await idbLoadCategories();
            const updated = existing.map(cat => ({
              ...cat,
              subcategories: next[cat.name] || [],
            }));
            await idbSaveCategories(updated);
          } catch (e) { console.error("[useCards] subcategory save failed", e); }
        })();
      }
      return next;
    });
  }, []);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState((prev) => updater(prev));
  }, []);

  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  // ── CRUD (extracted module) ──
  const { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard } = useCardCRUD({
    setCardMapState, cardMapRef,
  });

  // ── Annotations (extracted module) ──
  const {
    reviewSection, markRead, toggleTag, logError, clearErrorLog,
    addKeyPart, bulkFlagNeedsReview, reorderCards, bulkUpdateChapter,
  } = useCardAnnotations({ patchCard, setCardMapState, setReviewLog, cardMapRef });

  // ── Category management (extracted module) ──
  const getCategoryRecords = useCallback(() => categoryRecords, [categoryRecords]);
  const {
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    bulkUpdateSubcategory,
  } = useCategoryManagement({
    setCategories, setSubcategories, setCardMapState, cardMapRef, getCategoryRecords,
  });

  // ── Export/Import (extracted to separate modules) ──
  const { exportData, exportTemplate } = useCardExport({ cards, srSettings });
  const { importData, importCards } = useCardImport({
    setCategories, setSubcategories,
    setReviewLog: setReviewLogState, updateSRSettings,
    setCardMapState, cardMapRef,
    setCategoryRecordsState,
  });

  // ── Single-pass derived data (B2+B5 fix: 4×O(n) → 1×O(n)) ──
  // C2 fix: Build UUID→name map so catAccum is keyed by NAME but matched by UUID
  const { dueCards, stats, categoryStats, cardCountByCategory } = useMemo(() => {
    const now = Date.now();
    const dueList: Card[] = [];
    let totalSections = 0;
    let learnedSections = 0;
    let leechCount = 0;
    const catAccum: Record<string, { scoreSum: number; total: number; due: number }> = {};
    const countByCategory: Record<string, number> = {};

    // Build UUID→name lookup from categoryRecords (C2 fix)
    const uuidToName: Record<string, string> = {};
    for (const rec of categoryRecords) {
      uuidToName[rec.id] = rec.name;
    }

    // Initialize category accumulators by NAME (consumers use names)
    for (const cat of categories) {
      catAccum[cat] = { scoreSum: 0, total: 0, due: 0 };
      countByCategory[cat] = 0;
    }

    for (const card of cards) {
      // Resolve UUID to name for accumulation
      const catName = uuidToName[card.categoryId] || card.categoryId;

      // Card count by category name
      countByCategory[catName] = (countByCategory[catName] || 0) + 1;

      // Section-level stats
      let cardIsDue = false;
      let cardScoreSum = 0;
      for (const s of card.sections) {
        totalSections++;
        const isNew = s.state === SectionState.New;
        if (!isNew) {
          learnedSections++;
          if (s.nextReview <= now) cardIsDue = true;
        }
        if (isLeech(s)) leechCount++;
        cardScoreSum += getSectionScore(s);
      }

      if (cardIsDue) dueList.push(card);

      // Category stats accumulation — keyed by NAME
      const acc = catAccum[catName];
      if (acc) {
        acc.total++;
        acc.scoreSum += card.sections.length > 0 ? cardScoreSum / card.sections.length : 0;
        if (cardIsDue) acc.due++;
      }
    }

    // Pre-compute sort keys to avoid O(S) work during O(NlogN) sort
    const sortKeys = new Map<string, number>();
    for (const card of dueList) {
      let minNext = Infinity;
      for (const s of card.sections) {
        if (s.state !== SectionState.New && s.nextReview < minNext) minNext = s.nextReview;
      }
      sortKeys.set(card.id, minNext);
    }
    dueList.sort((a, b) => (sortKeys.get(a.id) ?? Infinity) - (sortKeys.get(b.id) ?? Infinity));

    // Finalize category stats
    const finalCatStats: Record<string, { score: number; total: number; due: number }> = {};
    for (const cat of categories) {
      const a = catAccum[cat];
      finalCatStats[cat] = {
        score: a.total > 0 ? Math.round(a.scoreSum / a.total) : 0,
        total: a.total,
        due: a.due,
      };
    }

    return {
      dueCards: dueList,
      stats: { due: dueList.length, total: cards.length, totalSections, learnedSections, leechCount },
      categoryStats: finalCatStats,
      cardCountByCategory: countByCategory,
    };
  }, [cards, categories, categoryRecords]);

  // H4 fix: Also update categoryRecordsState so sidebar reflects reorder immediately
  const reorderCategories = useCallback((ordered: string[]) => {
    setCategoriesState(ordered);
    (async () => {
      try {
        const existing = await idbLoadCategories();
        const byName = new Map(existing.map(c => [c.name, c]));
        const records: CategoryRecord[] = ordered.map((name, i) => {
          const rec = byName.get(name);
          return rec
            ? { ...rec, sortOrder: i }
            : { id: crypto.randomUUID(), name, sortOrder: i, subcategories: [] };
        });
        await idbSaveCategories(records);
        setCategoryRecordsState(records);
      } catch (e) { console.error("[useCards] reorderCategories save failed", e); }
    })();
  }, [setCategoryRecordsState]);

  // H6 fix: Persist subcategory reorder to IDB
  const reorderSubcategories = useCallback((category: string, ordered: string[]) => {
    setSubcategoriesState(prev => {
      const next = { ...prev, [category]: ordered };
      // Persist to IDB
      (async () => {
        try {
          const existing = await idbLoadCategories();
          const updated = existing.map(cat => cat.name === category
            ? { ...cat, subcategories: ordered }
            : cat
          );
          await idbSaveCategories(updated);
        } catch (e) { console.error("[useCards] reorderSubcategories save failed", e); }
      })();
      return next;
    });
  }, []);

  return {
    cards,
    categories,
    categoryRecords,
    subcategories,
    dueCards,
    stats,
    categoryStats,
    cardCountByCategory,
    reviewLog,
    srSettings,
    ready,
    dbError,
    patchCard,
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