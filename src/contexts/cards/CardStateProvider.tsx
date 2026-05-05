// ═══════════════════════════════════════════════════════════════════════════
// M1 — Composition root for card state. Decomposed from the old "God object"
// into focused hooks:
//   • useCardSyncEffects       — bus subscriptions & remote sync
//   • useReviewSettingsStore   — review log + SR settings
//   • useCardAggregates        — derived buckets / dueCards / stats
// All write paths now flow through `cardRepository` (Repository facade).
// Provider is a thin context-wiring layer.
// ═══════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, mapToArray, persistQueue } from "@/lib/persist-queue";
import { flushReviewLogQueue } from "@/lib/db";
import { cardCommandBus } from "@/lib/repositories/cardCommandBus";
import { useCardMap, setCardMap, cardMapRefFacade, type CardMapRefFacade } from "@/store/useCardMapStore";
import { useCardBootstrap } from "@/hooks/useCardBootstrap";
import { EMPTY_BUCKETS, type CardBuckets } from "@/lib/card-buckets";
import { useCategoryData, useCategoryStateSetter } from "./CategoryStateProvider";
import { useCardSyncEffects } from "./useCardSyncEffects";
import { useReviewSettingsStore } from "./useReviewSettingsStore";
import { useCardAggregates } from "./useCardAggregates";

// ─── Card state (re-renders on card mutations) ───
interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  cardCountByCategory: Record<string, number>;
  buckets: CardBuckets;
  ready: boolean;
}

const CardStateContext = createContext<CardStateContextValue | null>(null);

const EMPTY_CARD_STATE: CardStateContextValue = {
  cards: [],
  dueCards: [],
  stats: { due: 0, total: 0, totalSections: 0, learnedSections: 0, leechCount: 0 },
  cardCountByCategory: {},
  buckets: EMPTY_BUCKETS,
  ready: false,
};

export function useCardData() {
  const ctx = useContext(CardStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useCardData] no provider — returning empty fallback (HMR transient)");
      return EMPTY_CARD_STATE;
    }
    throw new Error("useCardData must be used within CardStateProvider");
  }
  return ctx;
}

// ─── Review state ───
interface ReviewStateContextValue {
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
}

const ReviewStateContext = createContext<ReviewStateContextValue | null>(null);

const EMPTY_REVIEW_STATE: ReviewStateContextValue = {
  reviewLog: [],
  srSettings: DEFAULT_SR_SETTINGS,
};

export function useReviewData() {
  const ctx = useContext(ReviewStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useReviewData] no provider — returning empty fallback (HMR transient)");
      return EMPTY_REVIEW_STATE;
    }
    throw new Error("useReviewData must be used within CardStateProvider");
  }
  return ctx;
}

// ─── Category-stats overlay ───
interface CategoryStatsContextValue {
  categoryStats: Record<string, { score: number; total: number; due: number }>;
}

const CategoryStatsContext = createContext<CategoryStatsContextValue | null>(null);

export function useCategoryStatsData() {
  const ctx = useContext(CategoryStatsContext);
  if (!ctx) return { categoryStats: {} };
  return ctx;
}

// ─── Internals exposed to action providers ───
interface CardStateInternals {
  setCardMapState: React.Dispatch<React.SetStateAction<CardMap>>;
  cardMapRef: CardMapRefFacade;
  commitReviewEntry: (entry: ReviewLogEntry) => void;
  commitReviewEntries: (entries: ReviewLogEntry[]) => void;
  setReviewLog: (updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => void;
  replaceReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
}

const CardStateInternalsContext = createContext<CardStateInternals | null>(null);

export function useCardStateInternals() {
  const ctx = useContext(CardStateInternalsContext);
  if (!ctx) throw new Error("useCardStateInternals must be used within CardStateProvider");
  return ctx;
}

export function useSettingsActions() {
  const { updateSRSettings } = useCardStateInternals();
  return useMemo(() => ({ updateSRSettings }), [updateSRSettings]);
}

export { useDbError } from "@/contexts/db/DbErrorProvider";

export function CardStateProvider({ children }: { children: ReactNode }) {
  const cardMap = useCardMap();
  const setCardMapState = setCardMap as React.Dispatch<React.SetStateAction<CardMap>>;
  const cardMapRef = cardMapRefFacade;

  const reviewSettings = useReviewSettingsStore();
  const { categories } = useCategoryData();
  const setCategoryRecordsState = useCategoryStateSetter();

  const { ready } = useCardBootstrap({
    setCardMapState,
    setCategoryRecordsState,
    setReviewLogState: reviewSettings.setReviewLogState,
    setSrSettingsState: reviewSettings.setSrSettingsState,
    cardMapRef,
  });

  // Bus subscriptions, source-link / review-confirmed sync, CARDS_UPDATED.
  useCardSyncEffects();

  // Quit / unmount drain — drain command bus, flush review log, persist queue.
  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    let unsubQuit: (() => void) | undefined;
    if (electron?.onQuitBackupRequested) {
      unsubQuit = electron.onQuitBackupRequested(async () => {
        try {
          await cardCommandBus.drain();
          await flushReviewLogQueue();
          await persistQueue.cleanup();
        } catch (err) {
          console.error("[CardStateProvider] quit flush failed", err);
        } finally {
          try { electron.notifyQuitBackupDone?.(); } catch { /* noop */ }
        }
      });
    }
    return () => {
      try { unsubQuit?.(); } catch { /* noop */ }
      void cardCommandBus.drain().then(() => {
        void flushReviewLogQueue();
        void persistQueue.cleanup();
      });
    };
  }, []);

  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);
  const { dueCards, stats, cardCountByCategory, buckets, categoryStats } =
    useCardAggregates(cards, categories);

  const cardState = useMemo<CardStateContextValue>(
    () => ({ cards, dueCards, stats, cardCountByCategory, buckets, ready }),
    [cards, dueCards, stats, cardCountByCategory, buckets, ready],
  );

  const reviewState = useMemo<ReviewStateContextValue>(
    () => ({ reviewLog: reviewSettings.reviewLog, srSettings: reviewSettings.srSettings }),
    [reviewSettings.reviewLog, reviewSettings.srSettings],
  );

  const categoryStatsValue = useMemo<CategoryStatsContextValue>(
    () => ({ categoryStats }),
    [categoryStats],
  );

  const internals = useMemo<CardStateInternals>(
    () => ({
      setCardMapState,
      cardMapRef,
      commitReviewEntry: reviewSettings.commitReviewEntry,
      commitReviewEntries: reviewSettings.commitReviewEntries,
      setReviewLog: reviewSettings.setReviewLog,
      replaceReviewLog: reviewSettings.replaceReviewLog,
      updateSRSettings: reviewSettings.updateSRSettings,
    }),
    [
      setCardMapState,
      cardMapRef,
      reviewSettings.commitReviewEntry,
      reviewSettings.commitReviewEntries,
      reviewSettings.setReviewLog,
      reviewSettings.replaceReviewLog,
      reviewSettings.updateSRSettings,
    ],
  );

  return (
    <CardStateInternalsContext.Provider value={internals}>
      <CardStateContext.Provider value={cardState}>
        <ReviewStateContext.Provider value={reviewState}>
          <CategoryStatsContext.Provider value={categoryStatsValue}>{children}</CategoryStatsContext.Provider>
        </ReviewStateContext.Provider>
      </CardStateContext.Provider>
    </CardStateInternalsContext.Provider>
  );
}
