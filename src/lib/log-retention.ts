/**
 * Append-only log retention.
 *
 * IndexedDB has a per-origin quota; unbounded review/latency/calibration/activity/pomodoro
 * logs are the most likely cause of QuotaExceededError in long-running installs.
 * On boot (idle) we keep only the newest MAX_RETAIN entries per log table.
 *
 * All target tables use auto-incrementing numeric primary keys (`++id`),
 * so ascending primary-key order === chronological insertion order.
 */
import { db } from "./db-schema";

import { logger } from "@/lib/logger";
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

  try {
    const tables = LOG_TABLES.map((name) => db.table(name));
    await db.transaction("rw", tables, async () => {
      for (const name of LOG_TABLES) {
        const tbl = db.table(name);
        const count = await tbl.count();
        if (count <= MAX_RETAIN) continue;
        const toDelete = count - MAX_RETAIN;
        const oldestKeys = (await tbl.toCollection().primaryKeys()).slice(0, toDelete);
        if (oldestKeys.length > 0) {
          await tbl.bulkDelete(oldestKeys);
        }
      }
    });
  } catch (err) {
    if (import.meta.env.DEV) {
      logger.warn("[log-retention] prune failed", err);
    }
  }
}

import { taskScheduler } from "@/lib/scheduler";

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
