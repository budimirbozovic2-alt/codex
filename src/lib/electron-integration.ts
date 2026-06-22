import { reviewLogRepository } from "@/lib/repositories";
import { awaitShutdownMainSqlite } from "@/lib/persistence/sqlite/main-ipc-client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

async function shutdownActiveSqliteBackend(timeoutMs = 8000): Promise<void> {
  if (!isElectron()) return;
  await awaitShutdownMainSqlite(timeoutMs);
}

/**
 * Runtime Electron detector — single source of truth.
 */
export function isElectron(): boolean {
  return typeof window !== "undefined" && 
    Boolean(window.electronAPI);
}

/**
 * Pure Desktop guard — Electron + SQLite required in all builds.
 */
export function assertDesktop(): void {
  if (isElectron()) return;
  throw new Error(
    "[pure-desktop] This build targets Electron only.",
  );
}

export async function setupElectronIPC() {
  if (!window.electronAPI) return;

  const buildBackupData = async () => {
    const { getSqliteExecutor } = await import(
      "@/lib/persistence/sqlite/client"
    );
    const { buildBackupSnapshot } = await import(
      "@/lib/backup/build-backup-snapshot"
    );
    const exec = await getSqliteExecutor();
    const snapshot = await buildBackupSnapshot(exec);

    const subcategories: Record<string, string[]> = {};
    snapshot.categories.forEach((r) => {
      if (r.subcategories?.length > 0) {
        subcategories[r.id] = r.subcategories.map((s) => s.name);
      }
    });

    const data: Record<string, unknown> = {
      ...snapshot,
      subcategories,
      timestamp: Date.now(),
    };
    if (snapshot.srSettings != null) {
      data.srSettings = {
        key: "srSettings",
        value: snapshot.srSettings,
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
            await shutdownActiveSqliteBackend(8000);
            await reviewLogRepository.flush();
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