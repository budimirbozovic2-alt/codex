import {
  createContext, useContext, useMemo, useState, useEffect, useRef, useCallback,
  type ReactNode,
} from "react";
import {
  Card, SRSettings, DEFAULT_SR_SETTINGS, SectionState, isLeech, getSectionScore,
} from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CardMap, mapToArray, persistQueue, schedulePersist, bumpMapVersion } from "@/lib/persist-queue";
import { idbSaveSettings, idbAddReviewLogEntry } from "@/lib/db";
import { onCardLinksCleared, onCardReviewConfirmed } from "@/lib/sources-storage";
import { eventBus, EVENT_TYPES } from "@/lib/event-bus";
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
  cards: [], dueCards: [],
  stats: { due: 0, total: 0, totalSections: 0, learnedSections: 0, leechCount: 0 },
  cardCountByCategory: {}, buckets: EMPTY_BUCKETS, ready: false,
};

export function useCardData() {
  const ctx = useContext(CardStateContext);
  if (!ctx) {
    // HMR safety: React-Refresh can momentarily render children before the
    // hot-replaced provider re-mounts. Throwing in DEV breaks the preview.
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
  /** Canonical review log mutation: updates state AND queues DB persist */
  commitReviewEntry: (entry: ReviewLogEntry) => void;
  /** Bulk commit for multiple entries (e.g., session flush) */
  commitReviewEntries: (entries: ReviewLogEntry[]) => void;
  /** Updater-form setter for advanced mutations */
  setReviewLog: (updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]) => void;
  /** Replace-form setter (used by import to overwrite the log wholesale). */
  replaceReviewLog: (log: ReviewLogEntry[]) => void;
  updateSRSettings: (settings: SRSettings) => void;
}

const CardStateInternalsContext = createContext<CardStateInternals | null>(null);

export function useCardStateInternals() {
  const ctx = useContext(CardStateInternalsContext);
  if (!ctx) throw new Error("useCardStateInternals must be used within CardStateProvider");
  return ctx;
}

// Public actions hook for SR settings — split out so SettingsPage doesn't
// need to pull a merged "all actions" object.
export function useSettingsActions() {
  const { updateSRSettings } = useCardStateInternals();
  return useMemo(() => ({ updateSRSettings }), [updateSRSettings]);
}

// ─── DB error broadcast — moved to dedicated DbErrorProvider ─────
// Re-exported here for backward-compatibility with `import { useDbError } from "./CardStateProvider"`.
export { useDbError } from "@/contexts/db/DbErrorProvider";

export function CardStateProvider({ children }: { children: ReactNode }) {
  const [cardMap, setCardMapState] = useState<CardMap>({});
  const [reviewLog, setReviewLogState] = useState<ReviewLogEntry[]>([]);
  const [srSettings, setSrSettingsState] = useState<SRSettings>(DEFAULT_SR_SETTINGS);

  // Categories live in the sibling provider; we read both the data and the setter for bootstrap.
  const { categories } = useCategoryData();
  const setCategoryRecordsState = useCategoryStateSetter();

  // Ref-Delta mirror — kept as an *independent* clone of state. CRUD hooks
  // mutate this ref in place for O(1) writes; never alias state and ref or
  // mutations will silently corrupt the rendered map.
  const cardMapRef = useRef<CardMap>({});
  useEffect(() => { cardMapRef.current = { ...cardMap }; }, [cardMap]);

  // Boot — dbError now lives in DbErrorProvider (consumed by RecoveryGate).
  const { ready } = useCardBootstrap({
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

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX A3: Source-link cleared sync — NOW SCHEDULES PERSIST
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    return onCardLinksCleared((clearedIds) => {
      setCardMapState(prev => {
        const next = { ...prev };
        let changed = false;
        for (const id of clearedIds) {
          if (next[id]?.sourceId) {
            const updated = { ...next[id], sourceId: undefined, textAnchor: undefined, needsReview: undefined };
            next[id] = updated;
            // Keep ref in sync as a separate object so future in-place CRUD
            // mutations don't bleed into rendered state.
            cardMapRef.current[id] = updated;
            
            // ✅ FIX A3: CRITICAL — Schedule DB persist for cleared link
            schedulePersist({ type: "put", card: updated });
            bumpMapVersion();
            
            changed = true;
          }
        }
        if (changed) return next;
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
        // Keep ref in sync as a separate object — never alias state and ref.
        cardMapRef.current[cardId] = updated;
        schedulePersist({ type: "put", card: updated });
        bumpMapVersion();
        return next;
      });
    });
  }, []);

  // CARDS_UPDATED → surgical merge when payload.cardIds is provided,
  // full reload otherwise (legacy emitters / remap-from-backup).
  useEffect(() => {
    interface CardsUpdatedPayload { source?: string; cardIds?: string[] }
    const SURGICAL_LIMIT = 200;
    return eventBus.subscribe<CardsUpdatedPayload>(EVENT_TYPES.CARDS_UPDATED, (payload) => {
      const ids = payload?.cardIds;
      if (ids && ids.length > 0 && ids.length <= SURGICAL_LIMIT) {
        // Surgical: re-fetch only mutated cards
        import("@/lib/db").then(({ db }) => {
          db.cards.bulkGet(ids).then((rows) => {
            const fetched = rows.filter((r): r is Card => !!r);
            const fetchedIds = new Set(fetched.map((c) => c.id));
            const deletedIds = ids.filter((id) => !fetchedIds.has(id));
            if (fetched.length === 0 && deletedIds.length === 0) return;
            // Sync ref first (Ref-Delta)
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
      // Fallback: full reload (legacy / large bulk / remap)
      import("@/lib/db-queries").then(({ idbLoadCards }) => {
        idbLoadCards().then((loaded) => {
          const map: CardMap = {};
          for (const c of loaded) map[c.id] = c;
          cardMapRef.current = map;
          setCardMapState({ ...map });
          bumpMapVersion();
        });
      });
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // FIX A2: CANONICAL REVIEW LOG MUTATION FUNCTIONS
  // These ensure state AND DB queue are always synchronized
  // ═══════════════════════════════════════════════════════════════════════════
  const commitReviewEntry = useCallback((entry: ReviewLogEntry) => {
    // 1. Update React state
    setReviewLogState((prev) => [...prev, entry]);
    // 2. Queue to DB (through the persist queue)
    idbAddReviewLogEntry(entry);
  }, []);

  const commitReviewEntries = useCallback((entries: ReviewLogEntry[]) => {
    if (entries.length === 0) return;
    // 1. Update React state
    setReviewLogState((prev) => [...prev, ...entries]);
    // 2. Queue each entry to DB
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

  // Buckets only depend on taxonomy fields (categoryId/subcategoryId/chapterId).
  // Reuse the previous bucket object when the fingerprint matches, so a grade
  // (which mutates only FSRS section state) doesn't trigger an O(N) rebuild.
  const bucketCacheRef = useRef<{ fp: string; buckets: CardBuckets } | null>(null);
  const buckets = useMemo(() => {
    const fp = bucketFingerprint(cards);
    const cached = bucketCacheRef.current;
    if (cached && cached.fp === fp) return cached.buckets;
    const fresh = buildCardBuckets(cards);
    bucketCacheRef.current = { fp, buckets: fresh };
    return fresh;
  }, [cards]);

  // ── Single-pass raw aggregate (depends ONLY on cards) ───────────────
  // Renaming a category does NOT touch this layer. Adding/removing a category
  // also doesn't touch it (we always key by card.categoryId in accumulators).
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
      if (!acc) { acc = { scoreSum: 0, total: 0, due: 0 }; perCatAccum[catKey] = acc; }
      acc.total++;
      acc.scoreSum += card.sections.length > 0 ? cardScoreSum / card.sections.length : 0;
      if (cardIsDue) acc.due++;
    }

    return { dueList, totalSections, learnedSections, leechCount, perCatAccum, countByCategory, totalCards: cards.length };
  }, [cards]);

  // ── Derived: dueCards (sorted) — depends only on aggregate.dueList ──
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

  // ── Derived: stats — depends only on aggregate ──
  const stats = useMemo(() => ({
    due: aggregate.dueList.length,
    total: aggregate.totalCards,
    totalSections: aggregate.totalSections,
    learnedSections: aggregate.learnedSections,
    leechCount: aggregate.leechCount,
  }), [aggregate]);

  // ── Derived: cardCountByCategory — fills zeros for empty categories ──
  // Re-runs on category add/remove (categories array reference change), but
  // is O(C) where C = number of categories.
  const cardCountByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const cat of categories) out[cat] = 0;
    for (const k in aggregate.countByCategory) out[k] = aggregate.countByCategory[k];
    return out;
  }, [aggregate.countByCategory, categories]);

  // ── Derived: categoryStats — final per-category numbers ──
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

  const cardState = useMemo<CardStateContextValue>(() => ({
    cards, dueCards, stats, cardCountByCategory, buckets, ready,
  }), [cards, dueCards, stats, cardCountByCategory, buckets, ready]);

  const reviewState = useMemo<ReviewStateContextValue>(() => ({
    reviewLog, srSettings,
  }), [reviewLog, srSettings]);

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
    [commitReviewEntry, commitReviewEntries, setReviewLog, replaceReviewLog, updateSRSettings],
  );

  return (
    <CardStateInternalsContext.Provider value={internals}>
      <CardStateContext.Provider value={cardState}>
        <ReviewStateContext.Provider value={reviewState}>
          <CategoryStatsContext.Provider value={categoryStatsValue}>
            {children}
          </CategoryStatsContext.Provider>
        </ReviewStateContext.Provider>
      </CardStateContext.Provider>
    </CardStateInternalsContext.Provider>
  );
}
