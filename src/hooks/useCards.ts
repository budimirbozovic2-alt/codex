import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Card,
  getDueCards,
  getStats,
  getCategoryStats,
  SRSettings,
  DEFAULT_SR_SETTINGS,
} from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { useCardExport } from "./useCardExport";
import { useCategoryManagement } from "./useCategoryManagement";
import { useCardImport } from "./useCardImport";
import { useCardCRUD } from "./useCardCRUD";
import { useCardBootstrap } from "./useCardBootstrap";
import { useCardAnnotations } from "./useCardAnnotations";
import { CardMap, mapToArray, persistQueue, schedulePersist } from "@/lib/persist-queue";
import {
  idbSaveCategories,
  idbSaveSubcategories,
  idbSaveSettings,
} from "@/lib/db";

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

  // ── Bulk map update (for operations touching many cards) ──
  const setCardMap = useCallback((updater: (prev: CardMap) => CardMap, persist: "surgical" | "full" = "full") => {
    let bulkCards: Card[] = [];
    setCardMapState((prev) => {
      const next = updater(prev);
      if (persist === "full") {
        bulkCards = Object.values(next);
      }
      return next;
    });
    if (bulkCards.length > 0) {
      schedulePersist({ type: "bulk", cards: bulkCards });
    }
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

  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  // ── CRUD (extracted module) ──
  const { patchCard, addCard, addFlashCard, updateCard, deleteCard, splitCard } = useCardCRUD({
    categories, setCardMapState, setCategories, schedulePersist,
  });

  // ── Annotations (extracted module) ──
  const {
    reviewSection, markRead, toggleTag, logError, clearErrorLog,
    addKeyPart, bulkFlagNeedsReview, reorderCards, bulkUpdateChapter,
  } = useCardAnnotations({ patchCard, setCardMapState, setReviewLog });

  // ── Category management (extracted module) ──
  const {
    addCategory, renameCategory, deleteCategory,
    addSubcategory, renameSubcategory, deleteSubcategory,
    bulkUpdateSubcategory,
  } = useCategoryManagement({
    categories, setCategories, setSubcategories, setCardMap, setCardMapState, schedulePersist,
  });

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
    dbError,
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
