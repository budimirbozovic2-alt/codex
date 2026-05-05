import { createContext, useContext, useMemo, useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { Card, SRSettings, DEFAULT_SR_SETTINGS, SectionState, isLeech, getSectionScore } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, mapToArray, persistQueue, schedulePersist, bumpMapVersion } from "@/lib/persist-queue";
import { useCardMap, setCardMap, cardMapRefFacade, type CardMapRefFacade } from "@/store/useCardMapStore";
import { idbSaveSettings, idbAddReviewLogEntry, flushReviewLogQueue } from "@/lib/db";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
import { initBacklinkIndexSubscriptions } from "@/lib/backlink-index";
import { useCardBootstrap } from "@/hooks/useCardBootstrap";
import { buildCardBuckets, EMPTY_BUCKETS, bucketFingerprint, type CardBuckets } from "@/lib/card-buckets";
import { useCategoryData, useCategoryStateSetter } from "./CategoryStateProvider";

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

  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  const { categories } = useCategoryData();
  const setCategoryRecordsState = useCategoryStateSetter();

  const { ready } = useCardBootstrap({
    setCardMapState,
    setCategoryRecordsState,
    setReviewLogState,
    setSrSettingsState,
    cardMapRef,
  });

  // FIX S4: Backlink index subscriptions — managed via React lifecycle (cleanup on unmount/HMR)
  useEffect(() => {
    return initBacklinkIndexSubscriptions();
  }, []);

  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    let unsubQuit: (() => void) | undefined;
    if (electron?.onQuitBackupRequested) {
      unsubQuit = electron.onQuitBackupRequested(async () => {
        try {
          // V2: drain review-log queue BEFORE persistQueue so any pending
          // grades captured during a fast-close get a chance to land.
          await flushReviewLogQueue();
          await persistQueue.cleanup();
        } catch (err) {
          console.error("[CardStateProvider] quit flush failed", err);
        } finally {
          try {
            electron.notifyQuitBackupDone?.();
          } catch {
            /* noop */
          }
        }
      });
    }
    return () => {
      try {
        unsubQuit?.();
      } catch {
        /* noop */
      }
      void flushReviewLogQueue();
      void persistQueue.cleanup();
    };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX S1 & A3: Source-link cleared sync (Idempotent React Updater)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    return onCardLinksCleared((clearedIds) => {
      const updates: Card[] = [];

      // 1. Synchronous side-effects OUTSIDE the React updater
      for (const id of clearedIds) {
        const currentCard = cardMapRef.current[id];
        if (currentCard?.sourceId) {
          const updated = { ...currentCard, sourceId: undefined, textAnchor: undefined, needsReview: undefined };
          cardMapRef.current[id] = updated; // Update ref immediately
          schedulePersist({ type: "put", card: updated }); // Enqueue DB persist
          updates.push(updated);
        }
      }

      // 2. Pure React state update
      if (updates.length > 0) {
        bumpMapVersion();
        setCardMapState((prev) => {
          const next = { ...prev };
          for (const card of updates) {
            next[card.id] = card;
          }
          return next;
        });
      }
    });
  }, [cardMapRef, setCardMapState]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX S1: confirmCardReview SSoT bridge (Idempotent React Updater)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    return onCardReviewConfirmed((cardId) => {
      const currentCard = cardMapRef.current[cardId];
      if (!currentCard) return;

      // 1. Synchronous side-effects OUTSIDE the React updater
      const updated = { ...currentCard, needsReview: undefined };
      cardMapRef.current[cardId] = updated;
      schedulePersist({ type: "put", card: updated });
      bumpMapVersion();

      // 2. Pure React state update
      setCardMapState((prev) => {
        if (!prev[cardId]) return prev;
        return { ...prev, [cardId]: updated };
      });
    });
  }, [cardMapRef, setCardMapState]);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX S2: CARDS_UPDATED -> Prevent Stale-Response Race Condition
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    interface CardsUpdatedPayload {
      source?: string;
      cardIds?: string[];
    }
    const SURGICAL_LIMIT = 200;

    let isSubscribed = true;
    let fetchSequence = 0; // Tracks the most recent fetch request

    const unsub = eventBus.subscribe<CardsUpdatedPayload>(EVENT_TYPES.CARDS_UPDATED, (payload) => {
      const currentSequence = ++fetchSequence; // Increment on every event
      const ids = payload?.cardIds;

      // V5: ALWAYS drain pending writes before re-reading IDB. Without this,
      // a CARDS_UPDATED event that fires within the 16 ms persist window can
      // pull stale rows and clobber freshly-mutated cards in cardMapRef.
      const drainThenFetch = persistQueue.cleanup();

      if (ids && ids.length > 0 && ids.length <= SURGICAL_LIMIT) {
        // Surgical branch
        drainThenFetch.then(() => import("@/lib/db")).then(({ db }) => {
          db.cards.bulkGet(ids).then((rows) => {
            // ABORT if unmounted or if a newer request has fired
            if (!isSubscribed || currentSequence !== fetchSequence) return;

            // V10: Belt-and-suspenders updatedAt guard. Even after the
            // persistQueue drain in V5, an in-flight `patchCard` mutation that
            // happened DURING the bulkGet round-trip would not yet be in IDB.
            // Skip any fetched row that is older than what we already hold
            // in memory.
            const localMap = cardMapRef.current;
            const fetched = rows
              .filter((r): r is Card => !!r)
              .filter((r) => {
                const local = localMap[r.id];
                if (!local) return true;
                const localTs = local.updatedAt ?? 0;
                const remoteTs = r.updatedAt ?? 0;
                return remoteTs >= localTs;
              });
            const fetchedIds = new Set(fetched.map((c) => c.id));
            const deletedIds = ids.filter((id) => !fetchedIds.has(id));

            if (fetched.length === 0 && deletedIds.length === 0) return;

            for (const c of fetched) cardMapRef.current[c.id] = c;
            for (const id of deletedIds) delete cardMapRef.current[id];

            setCardMapState((prev) => {
              const next = { ...prev };
              for (const c of fetched) next[c.id] = c;
              for (const id of deletedIds) delete next[id];
              return next;
            });
            bumpMapVersion();
          });
        });
        return;
      }

      // Fallback: full reload
      drainThenFetch.then(() => import("@/lib/db-queries")).then(({ idbLoadCards }) => {
        idbLoadCards().then((loaded) => {
          // ABORT if unmounted or if a newer request has fired
          if (!isSubscribed || currentSequence !== fetchSequence) return;

          const map: CardMap = {};
          for (const c of loaded) map[c.id] = c;
          cardMapRef.current = map;
          setCardMapState({ ...map });
          bumpMapVersion();
        });
      });
    });

    return () => {
      isSubscribed = false;
      unsub();
    };
  }, [cardMapRef, setCardMapState]);

  // ═══════════════════════════════════════════════════════════════════════════
  // CANONICAL REVIEW LOG MUTATION FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════
  const commitReviewEntry = useCallback((entry: ReviewLogEntry) => {
    setReviewLogState((prev) => [...prev, entry]);
    idbAddReviewLogEntry(entry);
  }, []);

  const commitReviewEntries = useCallback((entries: ReviewLogEntry[]) => {
    if (entries.length === 0) return;
    setReviewLogState((prev) => [...prev, ...entries]);
    for (const entry of entries) {
      idbAddReviewLogEntry(entry);
    }
  }, []);

  const setReviewLog = useCallback((updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => {
    setReviewLogState((prev) => updater(prev));
  }, []);

  const replaceReviewLog = useCallback((log: ReviewLogEntry[]) => {
    setReviewLogState(log);
  }, []);

  const updateSRSettings = useCallback((settings: SRSettings) => {
    setSrSettingsState(settings);
    idbSaveSettings("srSettings", settings);
  }, []);

  const cards = useMemo(() => mapToArray(cardMap), [cardMap]);

  const bucketCacheRef = useRef<{ fp: string; buckets: CardBuckets } | null>(null);
  const buckets = useMemo(() => {
    const fp = bucketFingerprint(cards);
    const cached = bucketCacheRef.current;
    if (cached && cached.fp === fp) return cached.buckets;
    const fresh = buildCardBuckets(cards);
    bucketCacheRef.current = { fp, buckets: fresh };
    return fresh;
  }, [cards]);

  const aggregate = useMemo(() => {
    const now = Date.now();
    const dueList: Card[] = [];
    let totalSections = 0;
    let learnedSections = 0;
    let leechCount = 0;
    const perCatAccum: Record<string, { scoreSum: number; total: number; due: number }> = {};
    const countByCategory: Record<string, number> = {};

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

      let acc = perCatAccum[catKey];
      if (!acc) {
        acc = { scoreSum: 0, total: 0, due: 0 };
        perCatAccum[catKey] = acc;
      }
      acc.total++;
      acc.scoreSum += card.sections.length > 0 ? cardScoreSum / card.sections.length : 0;
      if (cardIsDue) acc.due++;
    }

    return {
      dueList,
      totalSections,
      learnedSections,
      leechCount,
      perCatAccum,
      countByCategory,
      totalCards: cards.length,
    };
  }, [cards]);

  const dueCards = useMemo(() => {
    const list = aggregate.dueList.slice();
    const sortKeys = new Map<string, number>();
    for (const card of list) {
      let minNext = Infinity;
      for (const s of card.sections) {
        if (s.state !== SectionState.New && s.nextReview < minNext) minNext = s.nextReview;
      }
      sortKeys.set(card.id, minNext);
    }
    list.sort((a, b) => (sortKeys.get(a.id) ?? Infinity) - (sortKeys.get(b.id) ?? Infinity));
    return list;
  }, [aggregate.dueList]);

  const stats = useMemo(
    () => ({
      due: aggregate.dueList.length,
      total: aggregate.totalCards,
      totalSections: aggregate.totalSections,
      learnedSections: aggregate.learnedSections,
      leechCount: aggregate.leechCount,
    }),
    [aggregate],
  );

  const cardCountByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const cat of categories) out[cat] = 0;
    for (const k in aggregate.countByCategory) out[k] = aggregate.countByCategory[k];
    return out;
  }, [aggregate.countByCategory, categories]);

  const categoryStats = useMemo(() => {
    const out: Record<string, { score: number; total: number; due: number }> = {};
    for (const cat of categories) {
      const a = aggregate.perCatAccum[cat];
      out[cat] = a
        ? { score: a.total > 0 ? Math.round(a.scoreSum / a.total) : 0, total: a.total, due: a.due }
        : { score: 0, total: 0, due: 0 };
    }
    return out;
  }, [aggregate.perCatAccum, categories]);

  const cardState = useMemo<CardStateContextValue>(
    () => ({
      cards,
      dueCards,
      stats,
      cardCountByCategory,
      buckets,
      ready,
    }),
    [cards, dueCards, stats, cardCountByCategory, buckets, ready],
  );

  const reviewState = useMemo<ReviewStateContextValue>(
    () => ({
      reviewLog,
      srSettings,
    }),
    [reviewLog, srSettings],
  );

  const categoryStatsValue = useMemo<CategoryStatsContextValue>(() => ({ categoryStats }), [categoryStats]);

  const internals = useMemo<CardStateInternals>(
    () => ({
      setCardMapState,
      cardMapRef,
      commitReviewEntry,
      commitReviewEntries,
      setReviewLog,
      replaceReviewLog,
      updateSRSettings,
    }),
    [
      setCardMapState,
      cardMapRef,
      commitReviewEntry,
      commitReviewEntries,
      setReviewLog,
      replaceReviewLog,
      updateSRSettings,
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
