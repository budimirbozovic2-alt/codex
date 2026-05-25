// ─────────────────────────────────────────────────────────────────────────────
// reviewSettingsStore — Zustand atom for `reviewLog` + `srSettings`.
//
// Replaces the React-state copies that previously lived inside
// `useReviewSettingsStore` (a hook) + `CardStateProvider`. With state held in
// a Zustand store, action hooks (useCardAnnotations, useCardImport) and read
// hooks (useReviewData) can both access the same source of truth without a
// React Context — eliminating one whole layer of providers.
//
// IDB persistence still flows through `reviewLogRepository` /
// `settingsRepository` exactly as before.
// ─────────────────────────────────────────────────────────────────────────────
import { createStore } from "zustand/vanilla";
import { useSyncExternalStore } from "react";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";

interface ReviewSettingsState {
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
}

const REVIEW_LOG_CAP = 5000;

export const reviewSettingsStore = createStore<ReviewSettingsState>(() => ({
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

// ─── Sync reads (for non-React callers) ──────────────────────────────────
export function getReviewLog(): ReviewLogEntry[] {
  return reviewSettingsStore.getState().reviewLog;
}

export function getSrSettings(): SRSettings {
  return reviewSettingsStore.getState().srSettings;
}

// ─── Actions ─────────────────────────────────────────────────────────────
export function commitReviewEntry(entry: ReviewLogEntry): void {
  reviewSettingsStore.setState((s) => {
    const next = [...s.reviewLog, entry];
    return { reviewLog: next.length > REVIEW_LOG_CAP ? next.slice(-REVIEW_LOG_CAP) : next };
  });
  reviewLogRepository.append(entry);
}

export function commitReviewEntries(entries: ReviewLogEntry[]): void {
  if (entries.length === 0) return;
  reviewSettingsStore.setState((s) => {
    const next = [...s.reviewLog, ...entries];
    return { reviewLog: next.length > REVIEW_LOG_CAP ? next.slice(-REVIEW_LOG_CAP) : next };
  });
  reviewLogRepository.appendMany(entries);
}

/**
 * RAM-only mutation (no IDB write). Used by review-section hot path which
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
 * Boot-time seed (no IDB write — loaded from IDB upstream).
 */
export function seedSrSettings(settings: SRSettings): void {
  reviewSettingsStore.setState({ srSettings: settings });
}

export function __resetReviewSettingsStoreForTests(): void {
  reviewSettingsStore.setState({
    reviewLog: [],
    srSettings: DEFAULT_SR_SETTINGS,
  });
}
