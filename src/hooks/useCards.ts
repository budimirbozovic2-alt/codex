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
  type CategoryRecord,
} from "@/lib/db";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";

export function useCards() {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [categoryRecords, setCategoryRecordsState] = useState<CategoryRecord[]>([]);
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  // ── Derived state: categories (UUID list) and subcategories (name map) ──
  const categories = useMemo(() => categoryRecords.map(r => r.id), [categoryRecords]);

  const subcategories = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const r of categoryRecords) {
      map[r.id] = (r.subcategories || []).map((n: any) =>
        typeof n === "string" ? n : n.id  // UUID, not name
      );
    }
    return map;
  }, [categoryRecords]);

  // Flush pending actions on unmount to prevent data loss
  useEffect(() => {
    return () => { persistQueue.cleanup(); };
  }, []);

  // ── Boot (extracted module) ──
  const { ready: bootstrapReady, dbError } = useCardBootstrap({
    setCardMapState, setCategoryRecordsState, setReviewLogState, setSrSettingsState,
  });

  const ready = bootstrapReady;

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

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState((prev) => updater(prev));
  }, []);

  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  // ── CRUD (extracted module) ──
  const { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard, bulkAddCards } = useCardCRUD({
    setCardMapState, cardMapRef,
  });

  // ── Annotations (extracted module) ──
  const {
    reviewSection, markRead, toggleTag, logError, clearErrorLog,
    addKeyPart, bulkFlagNeedsReview, bulkUpdateChapter,
  } = useCardAnnotations({ patchCard, setCardMapState, setReviewLog, cardMapRef });

  // ── Category management (extracted module) ──
  const getCategoryRecords = useCallback(() => categoryRecords, [categoryRecords]);
  const {
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    bulkUpdateSubcategory,
    addChapter, renameChapter, deleteChapter,
    reorderSubcategories,
    reorderChapters,
    reorderCategories,
  } = useCategoryManagement({
    setCategoryRecords: setCategoryRecordsState,
    setCardMapState, cardMapRef, getCategoryRecords,
  });

  // ── Export/Import (extracted to separate modules) ──
  const { exportData, exportTemplate } = useCardExport({ cards, srSettings });
  const { importData, importCards } = useCardImport({
    setCategoryRecords: setCategoryRecordsState,
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

    // Build UUID→name lookup from categoryRecords (C2 fix)
    const uuidToName: Record<string, string> = {};
    for (const rec of categoryRecords) {
      uuidToName[rec.id] = rec.name;
    }

    // Initialize category accumulators by UUID
    for (const cat of categories) {
      catAccum[cat] = { scoreSum: 0, total: 0, due: 0 };
      countByCategory[cat] = 0;
    }

    for (const card of cards) {
      const catKey = card.categoryId;
      countByCategory[catKey] = (countByCategory[catKey] || 0) + 1;

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

      const acc = catAccum[catKey];
      if (acc) {
        acc.total++;
        acc.scoreSum += card.sections.length > 0 ? cardScoreSum / card.sections.length : 0;
        if (cardIsDue) acc.due++;
      }
    }

    const sortKeys = new Map<string, number>();
    for (const card of dueList) {
      let minNext = Infinity;
      for (const s of card.sections) {
        if (s.state !== SectionState.New && s.nextReview < minNext) minNext = s.nextReview;
      }
      sortKeys.set(card.id, minNext);
    }
    dueList.sort((a, b) => (sortKeys.get(a.id) ?? Infinity) - (sortKeys.get(b.id) ?? Infinity));

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
    bulkAddCards,
    reviewSection,
    markRead,
    toggleTag,
    addKeyPart,
    bulkFlagNeedsReview,
    bulkUpdateSubcategory,
    bulkUpdateChapter,
    
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
    addChapter,
    renameChapter,
    deleteChapter,
    reorderCategories,
    reorderSubcategories,
    reorderChapters,
    updateSRSettings,
  };
}
