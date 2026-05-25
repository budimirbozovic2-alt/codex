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
import { flushReviewLogQueue } from "@/lib/db";
import { persistQueue } from "@/lib/persist-queue";
import { useCardBootstrap } from "@/hooks/useCardBootstrap";
import { useCardSyncEffects } from "@/contexts/cards/useCardSyncEffects";
import { useCategoryStateBridge } from "@/contexts/cards/CategoryStateProvider";
import { logger } from "@/lib/logger";

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

  // Electron quit + unmount drain — flush review log + persist queue.
  useEffect(() => {
    const electron = typeof window !== "undefined" ? window.electronAPI : undefined;
    let unsubQuit: (() => void) | undefined;
    if (electron?.onQuitBackupRequested) {
      unsubQuit = electron.onQuitBackupRequested(async () => {
        try {
          await flushReviewLogQueue();
          await persistQueue.cleanup();
        } catch (err) {
          logger.error("[AppBootstrap] quit flush failed", err);
        } finally {
          try { electron.notifyQuitBackupDone?.(); } catch { /* noop */ }
        }
      });
    }
    return () => {
      try { unsubQuit?.(); } catch { /* noop */ }
      void flushReviewLogQueue();
      void persistQueue.cleanup();
    };
  }, []);

  return null;
}
