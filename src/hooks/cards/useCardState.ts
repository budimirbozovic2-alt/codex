// ═══════════════════════════════════════════════════════════════════════════
// Read hooks — TanStack Query is the in-memory source for cards, categories,
// review log, and global SR settings.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useSyncExternalStore } from "react";

import { Card, SRSettings } from "@/lib/spaced-repetition";

import { ReviewLogEntry } from "@/lib/storage";

import { useAllCards, useCardCountAll, useDueCards, useCardCountsByCategoryMap, useCategoryMasteryScores } from "@/hooks/card/useCardsQuery";

import { useCategoryData } from "./useCategoryState";

import { useCardAggregates } from "./useCardAggregates";

import {
  useReviewLog,
  useSrSettings,
  updateSrSettings,
} from "@/hooks/review/useReviewSettingsQuery";

import { useBootState } from "@/hooks/useBootState";
import { getCardsHydrated, subscribeCardsHydrated } from "@/lib/query/cards-cache-coordinator";
import {
  getCategoriesHydrated,
  subscribeCategoriesHydrated,
} from "@/lib/query/categories-cache-coordinator";
import { countConsolidationEligibleCards, countConsolidationEligibleByCategory } from "@/lib/review-mode-builder";

function useCards(): Card[] {
  return useAllCards() as Card[];
}

/** Boot FSM READY and core entity caches seeded from SQLite. */
export function useAppDataReady(): boolean {
  const bootState = useBootState();
  const cardsHydrated = useCardsHydrated();
  const categoriesHydrated = useCategoriesHydrated();

  return bootState.type === "ready" && cardsHydrated && categoriesHydrated;
}

export function useCardsHydrated(): boolean {
  return useSyncExternalStore(subscribeCardsHydrated, getCardsHydrated, getCardsHydrated);
}

export function useCategoriesHydrated(): boolean {
  return useSyncExternalStore(
    subscribeCategoriesHydrated,
    getCategoriesHydrated,
    getCategoriesHydrated,
  );
}

interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  ready: boolean;
}

export function useCardData(): CardStateContextValue {
  const cards = useCards();
  const dueCards = useDueCards() as Card[];
  const totalCards = useCardCountAll();
  const srSettings = useSrSettings();
  const { categories } = useCategoryData();
  const ready = useAppDataReady();
  const { stats: rawStats } = useCardAggregates(cards, categories);
  const consolidationDue = useMemo(
    () => countConsolidationEligibleCards({
      dueCards,
      allCards: cards,
      srSettings,
    }),
    [dueCards, cards, srSettings],
  );
  const stats = useMemo(
    () => ({
      ...rawStats,
      due: consolidationDue,
      total: totalCards > 0 ? totalCards : rawStats.total,
    }),
    [rawStats, consolidationDue, totalCards],
  );

  return useMemo(
    () => ({ cards, dueCards, stats, ready }),
    [cards, dueCards, stats, ready],
  );
}

interface ReviewStateContextValue {
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
}

export function useReviewData(): ReviewStateContextValue {
  const reviewLog = useReviewLog();
  const srSettings = useSrSettings();

  return useMemo(() => ({ reviewLog, srSettings }), [reviewLog, srSettings]);
}

interface CategoryStatsContextValue {
  categoryStats: Record<string, { score: number; total: number; due: number }>;
}

export function useCategoryStatsData(
  options?: { enabled?: boolean },
): CategoryStatsContextValue {
  const enabled = options?.enabled ?? true;
  const { categories } = useCategoryData();
  const cards = useAllCards();
  const dueCards = useDueCards();
  const srSettings = useSrSettings();

  const dueByCategory = useMemo(
    () => (enabled
      ? countConsolidationEligibleByCategory(cards, dueCards, srSettings, categories)
      : {}),
    [enabled, cards, dueCards, srSettings, categories],
  );
  const countByCategory = useCardCountsByCategoryMap(categories, { enabled });
  const scoreByCategory = useCategoryMasteryScores(categories, { enabled });

  const categoryStats = useMemo(() => {
    if (!enabled) return {};
    const out: Record<string, { score: number; total: number; due: number }> = {};
    for (const cat of categories) {
      out[cat] = {
        score: scoreByCategory[cat] ?? 0,
        total: countByCategory[cat] ?? 0,
        due: dueByCategory[cat] ?? 0,
      };
    }
    return out;
  }, [enabled, categories, scoreByCategory, countByCategory, dueByCategory]);

  return useMemo(() => ({ categoryStats }), [categoryStats]);
}

export function useSettingsActions() {
  return useMemo(() => ({ updateSRSettings: updateSrSettings }), []);
}
