import { type ReviewLogEntry, type PomodoroLogEntry, type LearnCardProgress } from "./types/logs";

export type { ReviewLogEntry, PomodoroLogEntry, LearnCardProgress };

const LAST_BACKUP_KEY = "sr-last-backup";

export async function addPomodoroEntry(entry: PomodoroLogEntry): Promise<void> {
  const { addPomodoroLogEntry } = await import("@/lib/db/queries");
  await addPomodoroLogEntry(entry);
}

export interface PomodoroStatsResult {
  today: number;
  todayMinutes: number;
  week: number;
  weekMinutes: number;
  total: number;
}

export async function getPomodoroStats(): Promise<PomodoroStatsResult> {
  const { loadPomodoroLogSince, countPomodoroLogByType } = await import("@/lib/db/queries");
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = todayStart - new Date().getDay() * 86400000;

  const [log, total] = await Promise.all([
    loadPomodoroLogSince(weekStart),
    countPomodoroLogByType("focus"),
  ]);

  let todayCount = 0, todayMinutes = 0, weekCount = 0, weekMinutes = 0;
  for (const e of log) {
    if (e.type !== "focus") continue;
    weekCount++;
    weekMinutes += e.durationMinutes;
    if (e.timestamp >= todayStart) {
      todayCount++;
      todayMinutes += e.durationMinutes;
    }
  }

  return {
    today: todayCount,
    todayMinutes,
    week: weekCount,
    weekMinutes,
    total,
  };
}

/** SQLite SSOT — legacy KV/localStorage migration runs at boot (`migrateBrowserLocalStorageToSqlite`) and in `migrateLearnProgressToRelational`. */
export async function loadLearnProgress(): Promise<Record<string, LearnCardProgress>> {
  const { loadAllLearnProgress } = await import("@/lib/db/queries");
  return loadAllLearnProgress();
}

export async function saveLearnProgress(
  data: Record<string, LearnCardProgress>,
): Promise<void> {
  const { replaceAllLearnProgress } = await import("@/lib/db/queries");
  await replaceAllLearnProgress(data);
}

export async function getStorageUsage(): Promise<{ usedBytes: number; maxBytes: number; percent: number }> {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    const used = est.usage ?? 0;
    const max = est.quota ?? 500 * 1024 * 1024;
    return { usedBytes: used, maxBytes: max, percent: Math.round((used / max) * 100) };
  }
  return { usedBytes: 0, maxBytes: 0, percent: 0 };
}

/** SQLite SSOT — boot migration lifts legacy `sr-last-backup` from localStorage. */
export async function getLastBackupTime(): Promise<number> {
  const { getSetting } = await import("@/lib/db/queries");
  return (await getSetting<number>(LAST_BACKUP_KEY)) ?? 0;
}

export async function setLastBackupTime(): Promise<void> {
  const { putSetting } = await import("@/lib/db/queries");
  await putSetting(LAST_BACKUP_KEY, Date.now());
}
