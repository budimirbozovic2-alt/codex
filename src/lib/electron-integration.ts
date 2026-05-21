import { persistQueue } from "@/lib/persist-queue";

import { logger } from "@/lib/logger";
export async function setupElectronIPC() {
  if (!window.electronAPI) return;

  const { db } = await import("./db");

  const buildBackupData = async () => {
    const [
      cards, categories, reviewLog, srSettingsRow,
      sources, mindMaps, diary,
      calibrationLog, latencyLog, slippageLog,
      activityLog, disciplineLog, pomodoroLog,
    ] = await Promise.all([
      db.cards.toArray(),
      db.categories.toArray(),
      db.reviewLog.toArray(),
      db.settings.get("srSettings").then(r => r?.value ?? null),
      db.sources.toArray(),
      db.mindMaps.toArray(),
      db.diary.toArray(),
      db.calibrationLog.toArray(),
      db.latencyLog.toArray(),
      db.slippageLog.toArray(),
      db.activityLog.toArray(),
      db.disciplineLog.toArray(),
      db.pomodoroLog.toArray(),
    ]);

    // Build subcategories map from CategoryRecord
    const subcategories: Record<string, string[]> = {};
    categories.forEach(r => {
      if (r.subcategories?.length > 0) {
        subcategories[r.id] = r.subcategories.map((s: { name: string } | string) => typeof s === "string" ? s : s.name);
      }
    });

    // Read planner data from IDB
    const [plannerConfigRow, dailyMappedRow, dailyMappedDateRow] = await Promise.all([
      db.settings.get("plannerConfig"),
      db.settings.get("dailyMapped"),
      db.settings.get("dailyMappedDate"),
    ]);

    const localStorageData: Record<string, unknown> = {};
    if (plannerConfigRow?.value) localStorageData["sr-planner-config"] = plannerConfigRow.value;
    if (dailyMappedRow?.value != null) localStorageData["sr-daily-mapped-count"] = dailyMappedRow.value;
    if (dailyMappedDateRow?.value) localStorageData["sr-daily-mapped-date"] = dailyMappedDateRow.value;

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
    if (srSettingsRow) data["srSettings"] = srSettingsRow;
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
