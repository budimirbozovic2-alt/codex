// ═══════════════════════════════════════════════════════════════════════════
// Provider Cleanup v2 — Context providers eliminated.
//
// Read hooks (useCardData, useReviewData, useCategoryStatsData,
// useSettingsActions) now read directly from Zustand stores via
// `useSyncExternalStore`. No Context, no provider tree, no fallback proxy.
//
// File path preserved for backwards-compat with the public re-exports.
// ═══════════════════════════════════════════════════════════════════════════
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Card, SRSettings } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { mapToArray, type CardMap } from "@/lib/persist-queue";
import { cardMapStore } from "@/store";
import { useCategoryData } from "./CategoryStateProvider";
import { useCardAggregates } from "./useCardAggregates";
import {
  reviewSettingsStore,
  useReviewLog,
  useSrSettings,
  updateSRSettings as updateSRSettingsAction,
} from "@/store/reviewSettingsStore";
import { useBootState } from "@/contexts/boot/BootStateProvider";

// ─── Cards array selector — cached by cardMap reference ─────────────────
let _cardsCacheMap: CardMap | null = null;
let _cardsCacheArr: Card[] = [];
function getCardsArray(): Card[] {
  const map = cardMapStore.getState().cardMap;
  if (map === _cardsCacheMap) return _cardsCacheArr;
  _cardsCacheMap = map;
  _cardsCacheArr = mapToArray(map);
  return _cardsCacheArr;
}

function useCards(): Card[] {
  return useSyncExternalStore(
    cardMapStore.subscribe,
    getCardsArray,
    getCardsArray,
  );
}

// ─── Public read hooks ──────────────────────────────────────────────────
interface CardStateContextValue {
  cards: Card[];
  dueCards: Card[];
  stats: { due: number; total: number; totalSections: number; learnedSections: number; leechCount: number };
  cardCountByCategory: Record<string, number>;
  ready: boolean;
}

export function useCardData(): CardStateContextValue {
  const cards = useCards();
  const { categories } = useCategoryData();
  const bootState = useBootState();
  const ready = bootState.type === "ready";
  const { dueCards, stats, cardCountByCategory } = useCardAggregates(cards, categories);
  return useMemo(
    () => ({ cards, dueCards, stats, cardCountByCategory, ready }),
    [cards, dueCards, stats, cardCountByCategory, ready],
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

export { useDbError } from "@/contexts/db/DbErrorProvider";

// Re-export the store handle for non-React callers (kept on this path for
// backwards-compat with any external imports).
export { reviewSettingsStore };

/** @deprecated Provider removed in v2 cleanup. Kept as no-op shim. */
export function CardStateProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
