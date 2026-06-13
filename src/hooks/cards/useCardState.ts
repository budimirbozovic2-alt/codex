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
import { useAllCards, useCardCountAll } from "@/hooks/card/useCardsQuery";
import { useCategoryData } from "./useCategoryState";
import { useCardAggregates } from "./useCardAggregates";
import {
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

/** Boot-ready signal only — does not subscribe to card queries. */
export function useCardReady(): boolean {
  const bootState = useBootState();
  return bootState.type === "ready";
}

interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  ready: boolean;
}

/**
 * Full card session data (all cards + FSRS aggregates). Use only on routes
 * that need the full table — not in layout shell components.
 */
export function useCardData(): CardStateContextValue {
  const cards = useCards();
  const totalCards = useCardCountAll();
  const { categories } = useCategoryData();
  const ready = useCardReady();
  const { dueCards, stats: rawStats } = useCardAggregates(cards, categories);
  const stats = useMemo(
    () => ({ ...rawStats, total: totalCards > 0 ? totalCards : rawStats.total }),
    [rawStats, totalCards],
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

/** Full per-category mastery stats — requires all cards. Dashboard/Stats only. */
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
