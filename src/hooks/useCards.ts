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
  idbSaveCategories,
  idbSaveSubcategories,
  idbSaveSettings,
} from "@/lib/db";
import { onCardLinksCleared } from "@/lib/sources-storage";

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categories, setCategoriesState] = useState<string[]>(["Opšte"]);
  const [subcategories, setSubcategoriesState] = useState<Record<string, string[]>>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  // Flush pending actions on unmount to prevent data loss
  useEffect(() => {
    return () => { persistQueue.cleanup(); };
  }, []);

  // ── Boot (extracted module) ──
  const { ready: bootstrapReady, dbError } = useCardBootstrap({
    setCardMapState, setCategoriesState, setSubcategoriesState, setReviewLogState, setSrSettingsState,
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



  const setCategories = useCallback((updater: (prev: string[]) => string[]) => {
    setCategoriesState(prev => {
      const next = updater(prev);
      if (next !== prev) idbSaveCategories(next);
      return next;
    });
  }, []);

  const setSubcategories = useCallback((updater: (prev: Record<string, string[]>) => Record<string, string[]>) => {
    setSubcategoriesState(prev => {
      const next = updater(prev);
      if (next !== prev) idbSaveSubcategories(next);
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
    categories, setCardMapState, setCategories, cardMapRef,
  });

  // ── Annotations (extracted module) ──
  const {
    reviewSection, markRead, toggleTag, logError, clearErrorLog,
    addKeyPart, bulkFlagNeedsReview, reorderCards, bulkUpdateChapter,
  } = useCardAnnotations({ patchCard, setCardMapState, setReviewLog, cardMapRef });

  // ── Category management (extracted module) ──
  const {
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    bulkUpdateSubcategory,
  } = useCategoryManagement({
    setCategories, setSubcategories, setCardMapState, cardMapRef,
  });

  // ── Export/Import (extracted to separate modules) ──
  const { exportData, exportTemplate } = useCardExport({ cards, categories, subcategories, srSettings });
  const { importData, importCards } = useCardImport({
    setCategories, setSubcategories,
    setReviewLog: setReviewLogState, updateSRSettings,
    setCardMapState, cardMapRef,
  });

  // ── Single-pass derived data (B2+B5 fix: 4×O(n) → 1×O(n)) ──
  const { dueCards, stats, categoryStats, cardCountByCategory } = useMemo(() => {
    const now = Date.now();
    const dueList: Card[] = [];
    let totalSections = 0;
    let learnedSections = 0;
    let leechCount = 0;
    const catAccum: Record<string, { scoreSum: number; total: number; due: number }> = {};
    const countByCategory: Record<string, number> = {};

    // Initialize category accumulators
    for (const cat of categories) {
      catAccum[cat] = { scoreSum: 0, total: 0, due: 0 };
      countByCategory[cat] = 0;
    }

    for (const card of cards) {
      // Card count by category
      countByCategory[card.category] = (countByCategory[card.category] || 0) + 1;

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

      // Category stats accumulation
      const acc = catAccum[card.category];
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
  }, [cards, categories]);

  const reorderCategories = useCallback((ordered: string[]) => {
    setCategoriesState(ordered);
    idbSaveCategories(ordered);
  }, []);

  const reorderSubcategories = useCallback((category: string, ordered: string[]) => {
    setSubcategoriesState(prev => {
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
