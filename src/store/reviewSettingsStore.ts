// ─────────────────────────────────────────────────────────────────────────────
// reviewSettingsStore — Zustand atom for `reviewLog` + `srSettings`.
//
// Replaces the React-state copies that previously lived inside
// `useReviewSettingsStore` (a hook) + `CardStateProvider`. With state held in
// a Zustand store, action hooks (useCardAnnotations, useCardImport) and read
// hooks (useReviewData) can both access the same source of truth without a
// React Context — eliminating one whole layer of providers.
//
// SQLite persistence flows through `reviewLogRepository` /
// `settingsRepository`.
// ─────────────────────────────────────────────────────────────────────────────
import { createStore } from "zustand/vanilla";
import { useSyncExternalStore } from "react";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { settingsRepository } from "@/lib/repositories";

interface ReviewSettingsState {
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
}

const REVIEW_LOG_CAP = 5000;

const reviewSettingsStore = createStore<ReviewSettingsState>(() => ({
  reviewLog: [],
  srSettings: DEFAULT_SR_SETTINGS,
}));

// ─── Read hooks (subscribe via useSyncExternalStore) ─────────────────────
export function useReviewLog(): ReviewLogEntry[] {
  return useSyncExternalStore(
    reviewSettingsStore.subscribe,
    () => reviewSettingsStore.getState().reviewLog,
    () => reviewSettingsStore.getState().reviewLog,
  );
}

export function useSrSettings(): SRSettings {
  return useSyncExternalStore(
    reviewSettingsStore.subscribe,
    () => reviewSettingsStore.getState().srSettings,
    () => reviewSettingsStore.getState().srSettings,
  );
}

// ─── Actions ─────────────────────────────────────────────────────────────
/**
 * RAM-only mutation (no SQLite write). Used by review-section hot path which
 * persists via `reviewLogRepository.append` separately.
 */
export function patchReviewLog(updater: (prev: ReviewLogEntry[]) => ReviewLogEntry[]): void {
  reviewSettingsStore.setState((s) => {
    const next = updater(s.reviewLog);
    if (next === s.reviewLog) return s;
    return { reviewLog: next.length > REVIEW_LOG_CAP ? next.slice(-REVIEW_LOG_CAP) : next };
  });
}

export function replaceReviewLog(log: ReviewLogEntry[]): void {
  reviewSettingsStore.setState({ reviewLog: log });
}

export function updateSRSettings(settings: SRSettings): void {
  reviewSettingsStore.setState({ srSettings: settings });
  void settingsRepository.save("srSettings", settings);
}

/**
 * Boot-time seed (no SQLite write — loaded from SQLite upstream).
 */
export function seedSrSettings(settings: SRSettings): void {
  reviewSettingsStore.setState({ srSettings: settings });
}
