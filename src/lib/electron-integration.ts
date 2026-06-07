import { persistQueue } from "@/lib/persist-queue";
import { reviewLogRepository } from "@/lib/repositories";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

/**
 * Runtime Electron detector — single source of truth.
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && 
    Boolean(window.electronAPI);
}

/**
 * Pure Desktop guard (P3 PR-8 finale).
 */
export function assertDesktop(): void {
  if (!import.meta.env.PROD) return;
  if (isElectron()) return;
  throw new Error(
    "[pure-desktop] This build targets Electron only.",
  );
}

export async function setupElectronIPC() {
  if (!window.electronAPI) return;

  const buildBackupData = async () => {
    // PR-H7 FIX: Pomjeranjem uvoza unutar handlera sprecavamo
    // preuranjeno izvrsavanje modula i "no executor" gresku pri boot-u.
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

    // Izrada mape podkategorija
    const subcategories: Record<string, string[]> = {};
    categories.forEach(r => {
      if (r.subcategories?.length > 0) {
        subcategories[r.id] = r.subcategories.map(
          (s: { name: string } | string) => 
            typeof s === "string" ? s : s.name
        );
      }
    });

    // Citanje konfiguracije planera
    const [
      plannerConfigVal, 
      dailyMappedVal, 
      dailyMappedDateVal
    ] = await Promise.all([
      getSetting<unknown>("plannerConfig"),
      getSetting<unknown>("dailyMapped"),
      getSetting<unknown>("dailyMappedDate"),
    ]);

    const localStorageData: Record<string, unknown> = {};
    if (plannerConfigVal != null) {
      localStorageData["sr-planner-config"] = plannerConfigVal;
    }
    if (dailyMappedVal != null) {
      localStorageData["sr-daily-mapped-count"] = dailyMappedVal;
    }
    if (dailyMappedDateVal != null) {
      localStorageData["sr-daily-mapped-date"] = dailyMappedDateVal;
    }

    const lsKeys = [
      "sr-app-settings", "sr-mnemonic-workshop",
      "sr-mnemonic-associations", "sr-major-system-map",
      "sr-learn-progress", "sr-last-backup",
    ];
    for (const key of lsKeys) {
      const val = localStorage.getItem(key);
      if (val !== null) {
        try { 
          localStorageData[key] = JSON.parse(val); 
        } catch { 
          localStorageData[key] = val; 
        }
      }
    }

    const data: Record<string, unknown> = {
      version: 5, type: "full",
      cards,
      categories: categories,
      subcategories,
      reviewLog,
      sources, mindMaps,
      diary, calibrationLog, latencyLog, slippageLog, 
      activityLog, disciplineLog, pomodoroLog,
      localStorageData,
      timestamp: Date.now()
    };
    if (srSettingsValue != null) {
      data["srSettings"] = { 
        key: "srSettings", 
        value: srSettingsValue 
      };
    }
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
        const success = await window.electronAPI
          .backupStreamChunk(chunk);
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

  const cleanup = window.electronAPI.onBackupRequested(
    async () => {
      try {
        const data = await buildBackupData();
        await streamBackup(data);
      } catch (e) {
        logger.error("Backup failed", e);
      }
    }
  );

  const cleanupQuit = window.electronAPI.onQuitBackupRequested?.(
    async () => {
      const QUIT_BACKUP_TIMEOUT_MS = 30_000;
      try {
        await Promise.race([
          (async () => {
            await reviewLogRepository.flush();
            await persistQueue.flush();
            const data = await buildBackupData();
            await streamBackup(data);
          })(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("quit-backup-timeout")),
              QUIT_BACKUP_TIMEOUT_MS,
            ),
          ),
        ]);
      } catch (err) {
        logger.error("[quit-backup] failed, releasing lock:", err);
        try {
          toast.error(
            "Auto-backup pri zatvaranju nije uspio."
          );
        } catch { /* if toast is unavailable late in teardown */ }
      } finally {
        window.electronAPI!.notifyQuitBackupDone?.();
      }
    }
  );

  const doCleanup = () => {
    cleanup();
    cleanupQuit?.();
  };

  window.addEventListener("beforeunload", doCleanup);
  // PR-H7: Zamjena "unload" sa modernim "pagehide" standardom
  window.addEventListener("pagehide", doCleanup);

  return doCleanup;
}