/**
 * @deprecated Legacy facade — do not add new imports.
 * Use canonical modules instead:
 * - Types: `@/lib/types/logs`
 * - Pomodoro: `@/lib/services/pomodoroStats`
 * - Backup time: `@/lib/backup/backup-metadata`
 * - Browser quota: `@/lib/services/browser-storage-estimate`
 * - Learn progress: `@/lib/db/queries`
 *
 * Removal tracked in TD-ARCH-1 (docs/architecture-refactoring-plan.md).
 */
export type { ReviewLogEntry, PomodoroLogEntry, LearnCardProgress } from "./types/logs";
export {
  addPomodoroEntry,
  getPomodoroStats,
  type PomodoroStatsResult,
} from "./services/pomodoroStats";
export { getLastBackupTime, setLastBackupTime } from "./backup/backup-metadata";
export {
  getBrowserStorageEstimate,
  getStorageUsage,
} from "./services/browser-storage-estimate";
export { loadAllLearnProgress, replaceAllLearnProgress } from "./db/queries";

/** @deprecated Use `loadAllLearnProgress` from `@/lib/db/queries`. */
export { loadAllLearnProgress as loadLearnProgress } from "./db/queries";

/** @deprecated Use `replaceAllLearnProgress` from `@/lib/db/queries`. */
export { replaceAllLearnProgress as saveLearnProgress } from "./db/queries";
