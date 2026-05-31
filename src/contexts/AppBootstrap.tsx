/**
 * AppBootstrap — single mount point for all card/category boot side-effects
 * previously living inside `CardStateProvider`.
 *
 * Renders nothing. Mounted once as a sibling inside `<BootRecoveryGate>`.
 * Read paths (useCardData, useReviewData, useCategoryData) now subscribe to
 * Zustand stores directly and do NOT depend on this component being mounted
 * — but its boot effects (DB open, schema, initial load) are what populate
 * those stores in the first place.
 *
 * Replaces the entire CardStateProvider → ActionsProvider → CategoryBridge
 * provider tree from the pre-cleanup architecture.
 */
import { useEffect } from "react";
import { reviewLogRepository } from "@/lib/repositories";
import { persistQueue } from "@/lib/persist-queue";
import { useCardBootstrap } from "@/hooks/useCardBootstrap";
import { useCardSyncEffects } from "@/hooks/cards/useCardSyncEffects";
import { useCategoryStateBridge } from "@/hooks/cards/useCategoryState";
import { kickoffEditorV4Migration } from "@/lib/editor-v4/lazy-migrate";
import { recordAppEntry } from "@/lib/metacognitive-storage";
import { useNotificationScheduler } from "@/hooks/useNotificationScheduler";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import { useCurrentView } from "@/hooks/useCurrentView";

export function AppBootstrap(): null {
  // Category-side bridge: examiner cache prime on records change.
  useCategoryStateBridge();

  // Schema + initial-load DAG. Writes into cardMapStore, categoryStore,
  // reviewSettingsStore via repositories.
  useCardBootstrap();

  // Cross-module wiring (backlink-index subscriptions, source-link sync,
  // review-confirmed sync). Lives in a hook because it's tied to React
  // lifecycle for cleanup.
  useCardSyncEffects();

  // editor-v4 lazy backfill — scheduled in idle, idempotent. Runs once per
  // page lifetime; subsequent calls no-op.
  useEffect(() => { kickoffEditorV4Migration(); }, []);

  // UI-level effects (moved from UIProvider in Provider Cleanup v2).
  useEffect(() => { recordAppEntry(); }, []);
  useNotificationScheduler();
  const view = useCurrentView();
  useActivityTracker(view);


  // PR-D D1: quit-backup IPC handler lives **only** in
  // `setupElectronIPC` (`lib/electron-integration.ts`). The previous
  // duplicate registration here meant every quit triggered two flushes
  // and two `notifyQuitBackupDone` IPC calls, racing on the shared
  // persistQueue and risking a double-completion signal to the main
  // process before the heavier streaming backup actually finished.
  // AppBootstrap still owns the unmount-time drain — that is a React
  // lifecycle concern, not an IPC concern, and runs only when this
  // tree literally unmounts (HMR, tab close, route change).
  useEffect(() => {
    return () => {
      void reviewLogRepository.flush();
      void persistQueue.cleanup();
    };
  }, []);

  return null;
}
