import { createContext, useContext, useEffect, useMemo, useRef, ReactNode, Suspense, lazy } from "react";
import { useCards } from "@/hooks/useCards";
import { Card, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { primeExaminerProfilesFromRecords } from "@/lib/examiner-profile-cache";
import { buildCardBuckets, EMPTY_BUCKETS, type CardBuckets } from "@/lib/card-buckets";

const LazyDatabaseRecoveryPanel = lazy(() => import("@/components/DatabaseRecoveryPanel"));

// ═══════════════════════════════════════════════════════════
// CARD STATE CONTEXT — cards, dueCards, stats (re-renders on card mutations)
// ═══════════════════════════════════════════════════════════
interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  cardCountByCategory: Record<string, number>;
  /** O(1) lookup buckets mirroring v15 IDB indexes — use for filters in render path. */
  buckets: CardBuckets;
  ready: boolean;
  dbError: { type: string; message: string } | null;
}

const CardStateContext = createContext<CardStateContextValue | null>(null);

const EMPTY_CARD_STATE: CardStateContextValue = {
  cards: [], dueCards: [],
  stats: { due: 0, total: 0, totalSections: 0, learnedSections: 0, leechCount: 0 },
  cardCountByCategory: {}, buckets: EMPTY_BUCKETS, ready: false, dbError: null,
};

export function useCardData() {
  const ctx = useContext(CardStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) console.warn("[useCardData] no provider — returning empty fallback (HMR?)");
    return EMPTY_CARD_STATE;
  }
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// CATEGORY STATE CONTEXT — categoryRecords, subcategories, categoryStats
// ═══════════════════════════════════════════════════════════
interface CategoryStateContextValue {
  categories: string[];
  categoryRecords: import("@/lib/db").CategoryRecord[];
  subcategories: Record<string, string[]>;
  categoryStats: Record<string, { score: number; total: number; due: number }>;
}

const CategoryStateContext = createContext<CategoryStateContextValue | null>(null);

const EMPTY_CATEGORY_STATE: CategoryStateContextValue = {
  categories: [], categoryRecords: [], subcategories: {}, categoryStats: {},
};

export function useCategoryData() {
  const ctx = useContext(CategoryStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) console.warn("[useCategoryData] no provider — returning empty fallback (HMR?)");
    return EMPTY_CATEGORY_STATE;
  }
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// REVIEW STATE CONTEXT — reviewLog, srSettings
// ═══════════════════════════════════════════════════════════
interface ReviewStateContextValue {
  reviewLog: import("@/lib/storage").ReviewLogEntry[];
  srSettings: import("@/lib/spaced-repetition").SRSettings;
}

const ReviewStateContext = createContext<ReviewStateContextValue | null>(null);

const EMPTY_REVIEW_STATE: ReviewStateContextValue = {
  reviewLog: [],
  srSettings: DEFAULT_SR_SETTINGS,
};

export function useReviewData() {
  const ctx = useContext(ReviewStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) console.warn("[useReviewData] no provider — returning empty fallback (HMR?)");
    return EMPTY_REVIEW_STATE;
  }
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// CARD ACTIONS CONTEXT — stable refs (never re-renders on data changes)
// ═══════════════════════════════════════════════════════════
interface CardActionsContextValue {
  patchCard: ReturnType<typeof useCards>["patchCard"];
  addCard: ReturnType<typeof useCards>["addCard"];
  addFlashCard: ReturnType<typeof useCards>["addFlashCard"];
  updateCard: ReturnType<typeof useCards>["updateCard"];
  deleteCard: ReturnType<typeof useCards>["deleteCard"];
  splitCard: ReturnType<typeof useCards>["splitCard"];
  bulkAddCards: ReturnType<typeof useCards>["bulkAddCards"];
  reviewSection: ReturnType<typeof useCards>["reviewSection"];
  markRead: ReturnType<typeof useCards>["markRead"];
  toggleTag: ReturnType<typeof useCards>["toggleTag"];
  addKeyPart: ReturnType<typeof useCards>["addKeyPart"];
  bulkFlagNeedsReview: ReturnType<typeof useCards>["bulkFlagNeedsReview"];
  bulkUpdateSubcategory: ReturnType<typeof useCards>["bulkUpdateSubcategory"];
  bulkUpdateChapter: ReturnType<typeof useCards>["bulkUpdateChapter"];
  
  logError: ReturnType<typeof useCards>["logError"];
  clearErrorLog: ReturnType<typeof useCards>["clearErrorLog"];
  exportData: ReturnType<typeof useCards>["exportData"];
  exportTemplate: ReturnType<typeof useCards>["exportTemplate"];
  importData: ReturnType<typeof useCards>["importData"];
  importCards: ReturnType<typeof useCards>["importCards"];
  addCategory: ReturnType<typeof useCards>["addCategory"];
  renameCategory: ReturnType<typeof useCards>["renameCategory"];
  deleteCategory: ReturnType<typeof useCards>["deleteCategory"];
  addSubcategory: ReturnType<typeof useCards>["addSubcategory"];
  renameSubcategory: ReturnType<typeof useCards>["renameSubcategory"];
  deleteSubcategory: ReturnType<typeof useCards>["deleteSubcategory"];
  addChapter: ReturnType<typeof useCards>["addChapter"];
  renameChapter: ReturnType<typeof useCards>["renameChapter"];
  deleteChapter: ReturnType<typeof useCards>["deleteChapter"];
  reorderCategories: ReturnType<typeof useCards>["reorderCategories"];
  reorderSubcategories: ReturnType<typeof useCards>["reorderSubcategories"];
  reorderChapters: ReturnType<typeof useCards>["reorderChapters"];
  updateExaminerProfile: ReturnType<typeof useCards>["updateExaminerProfile"];
  updateSRSettings: ReturnType<typeof useCards>["updateSRSettings"];
}

const CardActionsContext = createContext<CardActionsContextValue | null>(null);

export function useCardActions() {
  const ctx = useContext(CardActionsContext);
  if (!ctx) throw new Error("useCardActions must be used within CardProvider");
  return ctx;
}

// ═══════════════════════════════════════════════════════════
// PROVIDER
// ═══════════════════════════════════════════════════════════
export function CardProvider({ children }: { children: ReactNode }) {
  const h = useCards();

  // B1 fix: Ref-based stable actions — context value never changes reference
  const actionsRef = useRef<CardActionsContextValue>(null!);
  actionsRef.current = {
    patchCard: h.patchCard,
    addCard: h.addCard, addFlashCard: h.addFlashCard, updateCard: h.updateCard,
    deleteCard: h.deleteCard, splitCard: h.splitCard, bulkAddCards: h.bulkAddCards,
    reviewSection: h.reviewSection,
    markRead: h.markRead, toggleTag: h.toggleTag, addKeyPart: h.addKeyPart,
    bulkFlagNeedsReview: h.bulkFlagNeedsReview, bulkUpdateSubcategory: h.bulkUpdateSubcategory,
    bulkUpdateChapter: h.bulkUpdateChapter,
    logError: h.logError, clearErrorLog: h.clearErrorLog,
    exportData: h.exportData, exportTemplate: h.exportTemplate,
    importData: h.importData, importCards: h.importCards,
    addCategory: h.addCategory, renameCategory: h.renameCategory, deleteCategory: h.deleteCategory,
    addSubcategory: h.addSubcategory, renameSubcategory: h.renameSubcategory, deleteSubcategory: h.deleteSubcategory,
    addChapter: h.addChapter, renameChapter: h.renameChapter, deleteChapter: h.deleteChapter,
    reorderCategories: h.reorderCategories, reorderSubcategories: h.reorderSubcategories,
    reorderChapters: h.reorderChapters,
    updateExaminerProfile: h.updateExaminerProfile,
    updateSRSettings: h.updateSRSettings,
  };

  const actionKeys = useMemo(() => Object.keys(actionsRef.current) as (keyof CardActionsContextValue)[], []);
  const actions = useMemo<CardActionsContextValue>(() => new Proxy({} as CardActionsContextValue, {
    get: (_target, prop: string) => (actionsRef.current as unknown as Record<string, unknown>)[prop],
    ownKeys: () => actionKeys,
    getOwnPropertyDescriptor: (_target, prop) =>
      actionKeys.includes(prop as keyof CardActionsContextValue)
        ? { configurable: true, enumerable: true, writable: true, value: (actionsRef.current as unknown as Record<string, unknown>)[prop as string] }
        : undefined,
  }), [actionKeys]);

  // Buckets are recomputed only when the cards array reference changes
  // (Ref-Delta keeps that rare). All hot-path filters can then do O(1)
  // Map lookups instead of repeated O(N) scans.
  const buckets = useMemo(() => buildCardBuckets(h.cards), [h.cards]);

  // Split data into 3 granular contexts
  const cardState = useMemo<CardStateContextValue>(() => ({
    cards: h.cards, dueCards: h.dueCards, stats: h.stats,
    cardCountByCategory: h.cardCountByCategory, buckets, ready: h.ready, dbError: h.dbError,
  }), [h.cards, h.dueCards, h.stats, h.cardCountByCategory, buckets, h.ready, h.dbError]);

  const categoryState = useMemo<CategoryStateContextValue>(() => ({
    categories: h.categories, categoryRecords: h.categoryRecords,
    subcategories: h.subcategories, categoryStats: h.categoryStats,
  }), [h.categories, h.categoryRecords, h.subcategories, h.categoryStats]);

  // Sync-prime the examiner-profile cache so calculateNextReview never
  // sees `undefined` on the first review of a session.
  useEffect(() => {
    primeExaminerProfilesFromRecords(h.categoryRecords);
  }, [h.categoryRecords]);

  const reviewState = useMemo<ReviewStateContextValue>(() => ({
    reviewLog: h.reviewLog, srSettings: h.srSettings,
  }), [h.reviewLog, h.srSettings]);

  // H5 fix: Render recovery panel but still wrap in providers
  if (h.dbError) {
    return (
      <CardActionsContext.Provider value={actions}>
        <CardStateContext.Provider value={cardState}>
          <CategoryStateContext.Provider value={categoryState}>
            <ReviewStateContext.Provider value={reviewState}>
              <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-muted-foreground">Učitavanje...</div>}>
                <LazyDatabaseRecoveryPanel error={h.dbError} />
              </Suspense>
            </ReviewStateContext.Provider>
          </CategoryStateContext.Provider>
        </CardStateContext.Provider>
      </CardActionsContext.Provider>
    );
  }

  return (
    <CardActionsContext.Provider value={actions}>
      <CardStateContext.Provider value={cardState}>
        <CategoryStateContext.Provider value={categoryState}>
          <ReviewStateContext.Provider value={reviewState}>
            {children}
          </ReviewStateContext.Provider>
        </CategoryStateContext.Provider>
      </CardStateContext.Provider>
    </CardActionsContext.Provider>
  );
}
