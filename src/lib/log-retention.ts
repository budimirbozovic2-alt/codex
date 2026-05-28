/**
 * Append-only log retention.
 *
 * SQLite has ample capacity, but unbounded append-only logs still hurt
 * query latency and backup size. On boot (idle) we keep only the newest
 * MAX_RETAIN entries per log table.
 *
 * F6.2: Dexie putanja je dropped — prune ide kroz SQLite repo
 * (`pruneAutoIncTable` koristi `id` kao chronological cursor).
 */
import { pruneAutoIncTable } from "@/lib/db/queries";
import { logger } from "@/lib/logger";
import { taskScheduler } from "@/lib/scheduler";

const MAX_RETAIN = 10_000;

const LOG_TABLES = [
  "reviewLog",
  "latencyLog",
  "calibrationLog",
  "activityLog",
  "pomodoroLog",
] as const;

let didRunThisSession = false;

export async function pruneAppendOnlyLogs(): Promise<void> {
  if (didRunThisSession) return;
  didRunThisSession = true;

  for (const name of LOG_TABLES) {
    try {
      await pruneAutoIncTable(name, MAX_RETAIN);
    } catch (err) {
      if (import.meta.env.DEV) {
        logger.warn(`[log-retention] prune ${name} failed`, err);
      }
    }
  }
}

export function scheduleLogPrune(): void {
  taskScheduler.idle(
    () => { void pruneAppendOnlyLogs(); },
    { label: "log-retention:prune", priority: "idle", timeoutMs: 8000, fallbackMs: 4000 },
  );
}

/** Test-only hook to reset the session-once guard. */
export function __resetLogRetentionForTests(): void {
  didRunThisSession = false;
}
