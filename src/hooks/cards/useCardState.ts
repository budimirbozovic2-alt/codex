// ═══════════════════════════════════════════════════════════════════════════
// Provider Cleanup v2 — Context providers eliminated.
//
// Read hooks (useCardData, useReviewData, useCategoryStatsData,
// useSettingsActions) now read directly from Zustand stores via
// `useSyncExternalStore`. No Context, no provider tree, no fallback proxy.
//
// File path preserved for backwards-compat with the public re-exports.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo } from "react";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { useAllCards } from "@/hooks/card/useCardsQuery";
import { useCategoryData } from "./useCategoryState";
import { useCardAggregates } from "./useCardAggregates";
import {
  reviewSettingsStore,
  useReviewLog,
  useSrSettings,
  updateSRSettings as updateSRSettingsAction,
} from "@/store/reviewSettingsStore";
import { useBootState } from "@/hooks/useBootState";

// Post PR-E4: TanStack `['cards','all']` is the SOLE in-memory source for
// cards, invalidated via the `onCardsChanged` bridge after each SQLite
// write. The legacy `cardMapStore` / `cardMapWrites` modules are deleted.
function useCards(): Card[] {
  // TanStack returns `readonly Card[]`; downstream consumers expect mutable
  // arrays. Treated as same-reference cast (no copy) — array contents are
  // already immutable upstream so it's safe in practice.
  return useAllCards() as Card[];
}



interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  ready: boolean;
}


export function useCardData(): CardStateContextValue {
  const cards = useCards();
  const { categories } = useCategoryData();
  const bootState = useBootState();
  const ready = bootState.type === "ready";
  const { dueCards, stats } = useCardAggregates(cards, categories);
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

export function useCategoryStatsData(): CategoryStatsContextValue {
  const cards = useCards();
  const { categories } = useCategoryData();
  const { categoryStats } = useCardAggregates(cards, categories);
  return useMemo(() => ({ categoryStats }), [categoryStats]);
}

export function useSettingsActions() {
  // Stable reference — module-level action.
  return useMemo(() => ({ updateSRSettings: updateSRSettingsAction }), []);
}

export { useDbError } from "@/hooks/useDbError";

// Re-export the store handle for non-React callers (kept on this path for
// backwards-compat with any external imports).
export { reviewSettingsStore };

