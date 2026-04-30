import {
  createContext, useContext, useMemo, useState, useEffect, useRef, useCallback,
  type ReactNode,
} from "react";
import {
  Card, SRSettings, DEFAULT_SR_SETTINGS, SectionState, isLeech, getSectionScore,
} from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, mapToArray, persistQueue, schedulePersist, bumpMapVersion } from "@/lib/persist-queue";
import { idbSaveSettings } from "@/lib/db";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { useCardBootstrap } from "@/hooks/useCardBootstrap";
import { buildCardBuckets, EMPTY_BUCKETS, type CardBuckets } from "@/lib/card-buckets";
import { useCategoryDataInternal, useCategoryStateSetter } from "./CategoryStateProvider";

// ─── Card state (re-renders on card mutations) ───
interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  cardCountByCategory: Record<string, number>;
  buckets: CardBuckets;
  ready: boolean;
  dbError: { type: string; message: string } | null;
}

const EMPTY_CARD_STATE: CardStateContextValue = {
  cards: [], dueCards: [],
  stats: { due: 0, total: 0, totalSections: 0, learnedSections: 0, leechCount: 0 },
  cardCountByCategory: {}, buckets: EMPTY_BUCKETS, ready: false, dbError: null,
};

const CardStateContext = createContext<CardStateContextValue | null>(null);

export function useCardData() {
  const ctx = useContext(CardStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useCardData] no provider — returning empty fallback (HMR?)");
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

const EMPTY_REVIEW_STATE: ReviewStateContextValue = {
  reviewLog: [],
  srSettings: DEFAULT_SR_SETTINGS,
};

const ReviewStateContext = createContext<ReviewStateContextValue | null>(null);

export function useReviewData() {
  const ctx = useContext(ReviewStateContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn("[useReviewData] no provider — returning empty fallback (HMR?)");
      return EMPTY_REVIEW_STATE;
    }
    throw new Error("useReviewData must be used within CardStateProvider");
  }
  return ctx;
}

// ─── Category-stats overlay (combines category list with card-derived numbers) ───
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
  cardMapRef: React.MutableRefObject<CardMap>;
  setReviewLog: (updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
}

const CardStateInternalsContext = createContext<CardStateInternals | null>(null);

export function useCardStateInternals() {
  const ctx = useContext(CardStateInternalsContext);
  if (!ctx) throw new Error("useCardStateInternals must be used within CardStateProvider");
  return ctx;
}

// ─── DB error broadcast (consumed by composition root for recovery panel) ───
const DbErrorContext = createContext<{ type: string; message: string } | null>(null);
export function useDbError() {
  return useContext(DbErrorContext);
}

export function CardStateProvider({ children }: { children: ReactNode }) {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  // Categories live in the sibling provider; we read both the data and the setter for bootstrap.
  const { categories, categoryRecords } = useCategoryDataInternal();
  const setCategoryRecordsState = useCategoryStateSetter();

  // Ref-Delta mirror
  const cardMapRef = useRef<CardMap>({});
  useEffect(() => { cardMapRef.current = cardMap; }, [cardMap]);

  // Boot
  const { ready, dbError } = useCardBootstrap({
    setCardMapState,
    setCategoryRecordsState,
    setReviewLogState,
    setSrSettingsState,
  });

  // Quit-backup flush + unmount safety net
  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    let unsubQuit: (() => void) | undefined;
    if (electron?.onQuitBackupRequested) {
      unsubQuit = electron.onQuitBackupRequested(async () => {
        try { await persistQueue.cleanup(); } catch (err) {
          console.error("[CardStateProvider] quit flush failed", err);
        } finally {
          try { electron.notifyQuitBackupDone?.(); } catch { /* noop */ }
        }
      });
    }
    return () => {
      try { unsubQuit?.(); } catch { /* noop */ }
      void persistQueue.cleanup();
    };
  }, []);

  // Source-link cleared sync
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

  // confirmCardReview SSoT bridge
  useEffect(() => {
    return onCardReviewConfirmed((cardId) => {
      setCardMapState(prev => {
        if (!prev[cardId]) return prev;
        const updated = { ...prev[cardId], needsReview: undefined };
        const next = { ...prev, [cardId]: updated };
        cardMapRef.current = next;
        schedulePersist({ type: "put", card: updated });
        bumpMapVersion();
        return next;
      });
    });
  }, []);

  // HealthMonitor orphan cleanup → full reload
  useEffect(() => {
    return eventBus.subscribe(EVENT_TYPES.CARDS_UPDATED, () => {
      import("@/lib/db-queries").then(({ idbLoadCards }) => {
        idbLoadCards().then(loaded => {
          const map: CardMap = {};
          for (const c of loaded) map[c.id] = c;
          cardMapRef.current = map;
          setCardMapState(map);
          bumpMapVersion();
        });
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

  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);
  const buckets = useMemo(() => buildCardBuckets(cards), [cards]);

  // Single-pass derived data
  const { dueCards, stats, categoryStats, cardCountByCategory } = useMemo(() => {
    const now = Date.now();
    const dueList: Card[] = [];
    let totalSections = 0;
    let learnedSections = 0;
    let leechCount = 0;
    const catAccum: Record<string, { scoreSum: number; total: number; due: number }> = {};
    const countByCategory: Record<string, number> = {};

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

  const cardState = useMemo<CardStateContextValue>(() => ({
    cards, dueCards, stats, cardCountByCategory, buckets, ready, dbError,
  }), [cards, dueCards, stats, cardCountByCategory, buckets, ready, dbError]);

  const reviewState = useMemo<ReviewStateContextValue>(() => ({
    reviewLog, srSettings,
  }), [reviewLog, srSettings]);

  const categoryStatsValue = useMemo<CategoryStatsContextValue>(() => ({ categoryStats }), [categoryStats]);

  const internals = useMemo<CardStateInternals>(
    () => ({ setCardMapState, cardMapRef, setReviewLog, updateSRSettings }),
    [setReviewLog, updateSRSettings],
  );

  return (
    <DbErrorContext.Provider value={dbError}>
      <CardStateInternalsContext.Provider value={internals}>
        <CardStateContext.Provider value={cardState}>
          <ReviewStateContext.Provider value={reviewState}>
            <CategoryStatsContext.Provider value={categoryStatsValue}>
              {children}
            </CategoryStatsContext.Provider>
          </ReviewStateContext.Provider>
        </CardStateContext.Provider>
      </CardStateInternalsContext.Provider>
    </DbErrorContext.Provider>
  );
}
