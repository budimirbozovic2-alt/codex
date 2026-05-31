import { persistQueue } from "@/lib/persist-queue";
import { reviewLogRepository } from "@/lib/repositories";

import { logger } from "@/lib/logger";

/**
 * Runtime Electron detector — single source of truth for "are we running
 * inside the desktop shell?". Returns `false` only in the Vite dev preview
 * (where we tolerate a browser shell for HMR convenience). Production
 * builds assert desktop via {@link assertDesktop} below.
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

/**
 * Pure Desktop guard (P3 PR-8 finale). Throws in production builds if the
 * renderer is not hosted by the Electron shell. Call once from `main.tsx`
 * before mounting React. Dev builds skip the check so `bun run dev` keeps
 * working in a browser tab.
 */
export function assertDesktop(): void {
  if (!import.meta.env.PROD) return;
  if (isElectron()) return;
  throw new Error(
    "[pure-desktop] This build targets the Electron desktop shell only. " +
      "The web build was deprecated in P3 PR-8.",
  );
}
export async function setupElectronIPC() {
  if (!window.electronAPI) return;

  const {
    getSetting,
    readAllCardsForBackup,
    readAllCategoriesForBackup,
    readAllSourcesForBackup,
    readAllMindMapsForBackup,
    readAllDisciplineLogForBackup,
    readReviewLog,
    readDiary,
    readCalibrationLog,
    readLatencyLog,
    readSlippageLog,
    readActivityLog,
    readPomodoroLog,
  } = await import("@/lib/db/queries");

  const buildBackupData = async () => {
    // PR-9 A1b P1.B — SQLite-primary readers via the backup-readers seam;
    // unmigrated logs flow through the explicit Dexie read-replicas below.
    const [
      cards, categories, reviewLog, srSettingsValue,
      sources, mindMaps, diary,
      calibrationLog, latencyLog, slippageLog,
      activityLog, disciplineLog, pomodoroLog,
    ] = await Promise.all([
      readAllCardsForBackup(),
      readAllCategoriesForBackup(),
      readReviewLog(),
      getSetting<unknown>("srSettings"),
      readAllSourcesForBackup(),
      readAllMindMapsForBackup(),
      readDiary(),
      readCalibrationLog(),
      readLatencyLog(),
      readSlippageLog(),
      readActivityLog(),
      readAllDisciplineLogForBackup(),
      readPomodoroLog(),
    ]);

    // Build subcategories map from CategoryRecord
    const subcategories: Record<string, string[]> = {};
    categories.forEach(r => {
      if (r.subcategories?.length > 0) {
        subcategories[r.id] = r.subcategories.map((s: { name: string } | string) => typeof s === "string" ? s : s.name);
      }
    });

    // Read planner data via settings repo (SQLite-primary)
    const [plannerConfigVal, dailyMappedVal, dailyMappedDateVal] = await Promise.all([
      getSetting<unknown>("plannerConfig"),
      getSetting<unknown>("dailyMapped"),
      getSetting<unknown>("dailyMappedDate"),
    ]);

    const localStorageData: Record<string, unknown> = {};
    if (plannerConfigVal != null) localStorageData["sr-planner-config"] = plannerConfigVal;
    if (dailyMappedVal != null) localStorageData["sr-daily-mapped-count"] = dailyMappedVal;
    if (dailyMappedDateVal != null) localStorageData["sr-daily-mapped-date"] = dailyMappedDateVal;

    const lsKeys = [
      "sr-app-settings", "sr-mnemonic-workshop",
      "sr-mnemonic-associations", "sr-major-system-map",
      "sr-learn-progress", "sr-last-backup",
    ];
    for (const key of lsKeys) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try { localStorageData[key] = JSON.parse(val); } catch { localStorageData[key] = val; }
      }
    }

    const data: Record<string, unknown> = {
      version: 5, type: "full",
      cards,
      categories: categories,
      subcategories,
      reviewLog,
      sources, mindMaps,
      diary, calibrationLog, latencyLog, slippageLog, activityLog, disciplineLog, pomodoroLog,
      localStorageData,
      timestamp: Date.now()
    };
    if (srSettingsValue != null) data["srSettings"] = { key: "srSettings", value: srSettingsValue };
    return data;
  };

  const streamBackup = async (data: Record<string, unknown>) => {
    if (!window.electronAPI) return false;
    
    try {
      const json = JSON.stringify(data);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(json);
      
      const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks
      const started = await window.electronAPI.backupStreamStart();
      if (!started) return false;

      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        const chunk = bytes.slice(i, i + CHUNK_SIZE);
        const success = await window.electronAPI.backupStreamChunk(chunk);
        if (!success) {
          await window.electronAPI.backupStreamAbort();
          return false;
        }
      }

      return await window.electronAPI.backupStreamFinish();
    } catch (err) {
      logger.error("Streaming backup failed", err);
      if (window.electronAPI.backupStreamAbort) {
        await window.electronAPI.backupStreamAbort();
      }
      return false;
    }
  };

  // Slušač za backup na zahtjev
  const cleanup = window.electronAPI.onBackupRequested(async () => {
    try {
      const data = await buildBackupData();
      await streamBackup(data);
    } catch (e) {
      logger.error("Backup failed", e);
    }
  });

  // Sigurno zatvaranje uz flush queue-a
  const cleanupQuit = window.electronAPI.onQuitBackupRequested?.(async () => {
    try {
      await Promise.race([
        (async () => {
          // PR-D D1: flush the review-log queue first — this used to live
          // in a duplicate AppBootstrap handler; consolidating it here is
          // what made it safe to delete that one.
          await reviewLogRepository.flush();
          await persistQueue.flush();
          const data = await buildBackupData();
          await streamBackup(data);
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]);
    } catch (err) {
      logger.error("[quit-backup] failed, releasing lock:", err);
    } finally {
      window.electronAPI!.notifyQuitBackupDone?.();
    }
  });

  const doCleanup = () => {
    cleanup();
    cleanupQuit?.();
  };

  window.addEventListener("beforeunload", doCleanup);
  window.addEventListener("unload", doCleanup);

  return doCleanup;
}
