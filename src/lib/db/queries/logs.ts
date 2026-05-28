// ─────────────────────────────────────────────────────────────────────────────
// Log tables repository — PR-9 A1c-3 nastavak.
//
// SQLite-primary readers/writers for the 7 append-only / KV-shape log tables
// that were Dexie-only through A1c-2:
//
//   - reviewLog        ++id, cardId, timestamp
//   - pomodoroLog      ++id, timestamp
//   - diary            uuid id, date
//   - calibrationLog   ++id, cardId, timestamp
//   - latencyLog       ++id, cardId, timestamp
//   - slippageLog      ++id, date
//   - activityLog      ++id, timestamp
//
// All rows live as a JSON `payload` plus a small set of denormalised columns
// used for indexed lookups (matches the Dexie surface 1:1). Auto-increment
// tables map Dexie's `++id` to SQLite `INTEGER PRIMARY KEY AUTOINCREMENT`;
// `bulkAdd*` deliberately omits `id` from the INSERT so SQLite assigns it.
// `bulkPut*` is used by backup restore which carries existing ids — we
// preserve them via explicit-id INSERT OR REPLACE.
//
// Reads short-circuit to `[]`/`0` in non-Electron dev (with `assertDesktop`
// warning); PROD throws via `assertDesktop`.
// ─────────────────────────────────────────────────────────────────────────────
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type {
  DiaryEntry,
  CalibrationEntry,
  LatencyEntry,
  SlippageEntry,
  ActivityEntry,
} from "@/lib/metacognitive-storage";
import type { ReviewLogEntry, PomodoroLogEntry } from "@/lib/types/logs";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

type AutoIncRow<T> = T & { id?: number };

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("logs", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[logs-repo] sqlite executor unavailable", err);
    notifyExecutorNull("logs", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[logs-repo] ${label} — no executor (dev shell)`);
  return null;
}

function decode<T>(rows: readonly { payload: string; id?: number | string }[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.payload) as T;
      // For auto-inc tables, attach SQLite ROWID over whatever was in payload.
      if (r.id !== undefined) (parsed as unknown as { id: number | string }).id = r.id;
      out.push(parsed);
    } catch (err) {
      logger.warn("[logs-repo] decode failed, skipping row", err);
    }
  }
  return out;
}

// ── Generic auto-inc helpers ─────────────────────────────────────────────

async function listAllAutoInc<T>(
  table: string,
): Promise<T[]> {
  const exec = await requireExecutor(`listAll:${table}`);
  if (!exec) return [];
  const rows = await exec.all<{ id: number; payload: string }>(
    `SELECT id, payload FROM ${table} ORDER BY id ASC`,
  );
  return decode<T>(rows);
}

async function countTable(table: string): Promise<number> {
  const exec = await requireExecutor(`count:${table}`);
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(rows[0]?.n ?? 0);
}

async function clearTable(table: string): Promise<void> {
  const exec = await requireExecutor(`clear:${table}`);
  if (!exec) return;
  await exec.run(`DELETE FROM ${table}`);
}

// Bulk insert for auto-inc tables. `preserveId=true` keeps backup ids stable
// (used by restore); otherwise SQLite assigns fresh ROWIDs.
async function bulkInsertAutoInc<T>(
  table: string,
  rows: readonly AutoIncRow<T>[],
  cols: { [col: string]: (row: T) => string | number | null },
  opts: { preserveId?: boolean } = {},
): Promise<void> {
  if (rows.length === 0) return;
  const exec = await requireExecutor(`bulk:${table}`);
  if (!exec) return;
  const colNames = Object.keys(cols);
  await exec.transaction(async (tx) => {
    for (const row of rows) {
      const values: (string | number | null)[] = [];
      const placeholders: string[] = [];
      const insertCols: string[] = [];

      if (opts.preserveId && row.id !== undefined) {
        insertCols.push("id");
        placeholders.push("?");
        values.push(Number(row.id));
      }
      for (const c of colNames) {
        insertCols.push(c);
        placeholders.push("?");
        values.push(cols[c](row));
      }
      insertCols.push("payload");
      placeholders.push("?");
      // Strip volatile `id` from payload — it is sourced from the column.
      const cleaned: Record<string, unknown> = { ...(row as unknown as Record<string, unknown>) };
      delete cleaned.id;
      values.push(JSON.stringify(cleaned));

      const verb = opts.preserveId ? "INSERT OR REPLACE" : "INSERT";
      await tx.run(
        `${verb} INTO ${table} (${insertCols.join(",")}) VALUES (${placeholders.join(",")})`,
        values,
      );
    }
  });
}

// ── Per-table public API ─────────────────────────────────────────────────

// reviewLog (cardId, timestamp)
export const listAllReviewLog = (): Promise<ReviewLogEntry[]> => listAllAutoInc("reviewLog");
export const countReviewLog = () => countTable("reviewLog");
export const clearReviewLog = () => clearTable("reviewLog");
export const bulkPutReviewLog = (rows: readonly AutoIncRow<ReviewLogEntry>[]) =>
  bulkInsertAutoInc<ReviewLogEntry>(
    "reviewLog",
    rows,
    {
      cardId: (r) => r.cardId,
      timestamp: (r) => Number(r.timestamp ?? 0),
    },
    { preserveId: true },
  );

/** A1c-4 F2 — bounded-window reader used by boot to hydrate the RAM mirror. */
export async function loadRecentReviewLog(days: number): Promise<ReviewLogEntry[]> {
  const exec = await requireExecutor("loadRecent:reviewLog");
  if (!exec) return [];
  const cutoff = Date.now() - days * 86400000;
  const rows = await exec.all<{ id: number; payload: string }>(
    "SELECT id, payload FROM reviewLog WHERE timestamp >= ? ORDER BY timestamp ASC",
    [cutoff],
  );
  return decode<ReviewLogEntry>(rows);
}

// pomodoroLog (timestamp)
export const listAllPomodoroLog = (): Promise<PomodoroLogEntry[]> => listAllAutoInc("pomodoroLog");
export const countPomodoroLog = () => countTable("pomodoroLog");
export const clearPomodoroLog = () => clearTable("pomodoroLog");
export const bulkPutPomodoroLog = (rows: readonly AutoIncRow<PomodoroLogEntry>[]) =>
  bulkInsertAutoInc<PomodoroLogEntry>(
    "pomodoroLog",
    rows,
    { timestamp: (r) => Number(r.timestamp ?? 0) },
    { preserveId: true },
  );

// calibrationLog
export const listAllCalibrationLog = (): Promise<CalibrationEntry[]> => listAllAutoInc("calibrationLog");
export const countCalibrationLog = () => countTable("calibrationLog");
export const clearCalibrationLog = () => clearTable("calibrationLog");
export const bulkPutCalibrationLog = (rows: readonly AutoIncRow<CalibrationEntry>[]) =>
  bulkInsertAutoInc<CalibrationEntry>(
    "calibrationLog",
    rows,
    {
      cardId: (r) => r.cardId,
      timestamp: (r) => Number(r.timestamp ?? 0),
    },
    { preserveId: true },
  );

// latencyLog
export const listAllLatencyLog = (): Promise<LatencyEntry[]> => listAllAutoInc("latencyLog");
export const countLatencyLog = () => countTable("latencyLog");
export const clearLatencyLog = () => clearTable("latencyLog");
export const bulkPutLatencyLog = (rows: readonly AutoIncRow<LatencyEntry>[]) =>
  bulkInsertAutoInc<LatencyEntry>(
    "latencyLog",
    rows,
    {
      cardId: (r) => r.cardId,
      timestamp: (r) => Number(r.timestamp ?? 0),
    },
    { preserveId: true },
  );

// slippageLog (date)
export const listAllSlippageLog = (): Promise<SlippageEntry[]> => listAllAutoInc("slippageLog");
export const countSlippageLog = () => countTable("slippageLog");
export const clearSlippageLog = () => clearTable("slippageLog");
export const bulkPutSlippageLog = (rows: readonly AutoIncRow<SlippageEntry>[]) =>
  bulkInsertAutoInc<SlippageEntry>(
    "slippageLog",
    rows,
    { date: (r) => (r as unknown as { date?: string }).date ?? "" },
    { preserveId: true },
  );

// activityLog
export const listAllActivityLog = (): Promise<ActivityEntry[]> => listAllAutoInc("activityLog");
export const countActivityLog = () => countTable("activityLog");
export const clearActivityLog = () => clearTable("activityLog");
export const bulkPutActivityLog = (rows: readonly AutoIncRow<ActivityEntry>[]) =>
  bulkInsertAutoInc<ActivityEntry>(
    "activityLog",
    rows,
    { timestamp: (r) => Number((r as unknown as { timestamp?: number }).timestamp ?? 0) },
    { preserveId: true },
  );

// diary (UUID PK)
export async function listAllDiary(): Promise<DiaryEntry[]> {
  const exec = await requireExecutor("listAll:diary");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>("SELECT payload FROM diary ORDER BY date ASC");
  return decode<DiaryEntry>(rows);
}
export const countDiary = () => countTable("diary");
export const clearDiary = () => clearTable("diary");
export async function bulkPutDiary(rows: readonly DiaryEntry[]): Promise<void> {
  if (rows.length === 0) return;
  const exec = await requireExecutor("bulk:diary");
  if (!exec) return;
  await exec.transaction(async (tx) => {
    for (const r of rows) {
      await tx.run(
        "INSERT OR REPLACE INTO diary (id, date, payload) VALUES (?, ?, ?)",
        [r.id, r.date ?? "", JSON.stringify(r)],
      );
    }
  });
}


// ── F6.2 helpers — windowed reads + single-row add + prune ───────────────

async function loadSinceNumeric<T>(
  table: string, col: string, since: number,
): Promise<T[]> {
  const exec = await requireExecutor(`loadSince:${table}`);
  if (!exec) return [];
  const rows = await exec.all<{ id: number; payload: string }>(
    `SELECT id, payload FROM ${table} WHERE ${col} > ? ORDER BY id ASC`,
    [since],
  );
  return decode<T>(rows);
}

async function loadSinceText<T>(
  table: string, col: string, since: string,
): Promise<T[]> {
  const exec = await requireExecutor(`loadSince:${table}`);
  if (!exec) return [];
  const rows = await exec.all<{ id: number; payload: string }>(
    `SELECT id, payload FROM ${table} WHERE ${col} > ? ORDER BY id ASC`,
    [since],
  );
  return decode<T>(rows);
}

export const loadCalibrationLogSince = (cutoff: number) =>
  loadSinceNumeric<CalibrationEntry>("calibrationLog", "timestamp", cutoff);
export const loadLatencyLogSince = (cutoff: number) =>
  loadSinceNumeric<LatencyEntry>("latencyLog", "timestamp", cutoff);
export const loadActivityLogSince = (cutoff: number) =>
  loadSinceNumeric<ActivityEntry>("activityLog", "timestamp", cutoff);
export const loadSlippageLogSinceDate = (cutoffDate: string) =>
  loadSinceText<SlippageEntry>("slippageLog", "date", cutoffDate);

export const addCalibrationLogEntry = (e: CalibrationEntry) =>
  bulkPutCalibrationLog([e as AutoIncRow<CalibrationEntry>]);
export const addLatencyLogEntry = (e: LatencyEntry) =>
  bulkPutLatencyLog([e as AutoIncRow<LatencyEntry>]);
export const addActivityLogEntry = (e: ActivityEntry) =>
  bulkPutActivityLog([e as AutoIncRow<ActivityEntry>]);
export const addSlippageLogEntry = (e: SlippageEntry) =>
  bulkPutSlippageLog([e as AutoIncRow<SlippageEntry>]);

/**
 * Retention prune: keep newest `maxRetain` rows in an auto-inc log table.
 * Uses a single DELETE bounded by id since auto-inc id is chronological.
 */
export async function pruneAutoIncTable(table: string, maxRetain: number): Promise<number> {
  const exec = await requireExecutor(`prune:${table}`);
  if (!exec) return 0;
  const countRow = await exec.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  const total = Number(countRow[0]?.n ?? 0);
  if (total <= maxRetain) return 0;
  const cutoffRow = await exec.all<{ id: number }>(
    `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1 OFFSET ?`,
    [maxRetain],
  );
  const cutoff = cutoffRow[0]?.id;
  if (cutoff === undefined) return 0;
  await exec.run(`DELETE FROM ${table} WHERE id <= ?`, [cutoff]);
  return total - maxRetain;
}

