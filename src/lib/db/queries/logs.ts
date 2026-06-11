// ─────────────────────────────────────────────────────────────────
// Log tables repository — PR-9 A1c-3 nastavak.
// SQLite-primary readers/writers for 7 log tables.
// ─────────────────────────────────────────────────────────────────
import type { 
  SqlExecutor, 
  SqlBindValue 
} from "@/lib/persistence/sqlite/executor";
import type {
  DiaryEntry,
  CalibrationEntry,
  LatencyEntry,
  SlippageEntry,
  ActivityEntry,
} from "@/domains/metacognition/metacognitive-storage";
import type { 
  ReviewLogEntry, 
  PomodoroLogEntry 
} from "@/lib/types/logs";
import { logger } from "@/lib/logger";
import { 
  notifyExecutorNull 
} from "./_shared/executor-telemetry";

type AutoIncRow<T> = T & { id?: number };

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import(
      "@/lib/electron-integration"
    );
    if (!isElectron() && import.meta.env.PROD) { 
      notifyExecutorNull("logs", "non-electron"); 
      return null; 
    }
    const { getOpfsSqliteExecutor } = await import(
      "@/lib/persistence/sqlite/client"
    );
    
    // Faza 4: Mrtvi polling kod uklonjen. Klijent baze
    // osigurava boot sequence i baca grešku ako padne.
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[logs-repo] sqlite executor unavailable", err);
    notifyExecutorNull("logs", "error");
    return null;
  }
}

async function requireExecutor(
  label: string
): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import(
    "@/lib/electron-integration"
  );
  assertDesktop();
  logger.warn(`[logs-repo] ${label} — no executor (dev shell)`);
  return null;
}

function decode<T>(
  rows: readonly { payload: string; id?: number | string }[]
): T[] {
  const out: T[] = [];
  for (const r of rows) {
    try {
      const parsed = JSON.parse(r.payload) as T;
      if (r.id !== undefined) {
        (parsed as unknown as { 
          id: number | string 
        }).id = r.id;
      }
      out.push(parsed);
    } catch (err) {
      logger.warn(
        "[logs-repo] decode failed, skipping row", 
        err
      );
    }
  }
  return out;
}

// ── Generic auto-inc helpers ─────────────────────────────────────

async function listAllAutoInc<T>(table: string): Promise<T[]> {
  const { withSqlTiming } = await import(
    "./_shared/sql-timing"
  );
  return withSqlTiming(`listAll:${table}`, async () => {
    const exec = await requireExecutor(`listAll:${table}`);
    if (!exec) return [];
    const rows = await exec.all<{ id: number; payload: string }>(
      `SELECT id, payload FROM ${table} ORDER BY id ASC`,
    );
    return decode<T>(rows);
  });
}

async function countTable(table: string): Promise<number> {
  const exec = await requireExecutor(`count:${table}`);
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table}`
  );
  return Number(rows[0]?.n ?? 0);
}

/** P-2 OPTIMIZACIJA: Masovni RPC runMany umjesto for petlje */
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
  const insertCols: string[] = [];
  const placeholders: string[] = [];

  if (opts.preserveId) {
    insertCols.push("id");
    placeholders.push("?");
  }
  for (const c of colNames) {
    insertCols.push(c);
    placeholders.push("?");
  }
  insertCols.push("payload");
  placeholders.push("?");

  const batches: SqlBindValue[][] = rows.map((row) => {
    const values: SqlBindValue[] = [];
    if (opts.preserveId && row.id !== undefined) {
      values.push(Number(row.id));
    } else if (opts.preserveId) {
      values.push(null); // auto-inc null if missing
    }
    
    for (const c of colNames) {
      values.push(cols[c](row) as SqlBindValue);
    }
    
    const cleaned: Record<string, unknown> = { 
      ...(row as unknown as Record<string, unknown>) 
    };
    delete cleaned.id;
    values.push(JSON.stringify(cleaned) as SqlBindValue);
    
    return values;
  });

  const verb = opts.preserveId ? "INSERT OR REPLACE" : "INSERT";
  const sql = `${verb} INTO ${table} (${insertCols.join(",")}) ` +
              `VALUES (${placeholders.join(",")})`;

  await exec.transaction(async (tx) => {
    await tx.runMany(sql, batches);
  });
}

// ── Per-table public API ─────────────────────────────────────────

export const listAllReviewLog = (): Promise<ReviewLogEntry[]> => 
  listAllAutoInc("reviewLog");
  
export const countReviewLog = () => countTable("reviewLog");

export const bulkPutReviewLog = (
  rows: readonly AutoIncRow<ReviewLogEntry>[]
) =>
  bulkInsertAutoInc<ReviewLogEntry>(
    "reviewLog",
    rows,
    {
      cardId: (r) => r.cardId,
      timestamp: (r) => Number(r.timestamp ?? 0),
    },
    { preserveId: true },
  );

export async function loadRecentReviewLog(
  days: number
): Promise<ReviewLogEntry[]> {
  const exec = await requireExecutor("loadRecent:reviewLog");
  if (!exec) return [];
  const cutoff = Date.now() - days * 86400000;
  const rows = await exec.all<{ id: number; payload: string }>(
    `SELECT id, payload FROM reviewLog 
     WHERE timestamp >= ? ORDER BY timestamp ASC`,
    [cutoff],
  );
  return decode<ReviewLogEntry>(rows);
}

export const listAllPomodoroLog = (): 
  Promise<PomodoroLogEntry[]> => listAllAutoInc("pomodoroLog");
  
export const countPomodoroLog = () => countTable("pomodoroLog");

const bulkPutPomodoroLog = (
  rows: readonly AutoIncRow<PomodoroLogEntry>[]
) =>
  bulkInsertAutoInc<PomodoroLogEntry>(
    "pomodoroLog",
    rows,
    { timestamp: (r) => Number(r.timestamp ?? 0) },
    { preserveId: true },
  );
  
export const addPomodoroLogEntry = (e: PomodoroLogEntry) =>
  bulkPutPomodoroLog([e as AutoIncRow<PomodoroLogEntry>]);
  
export const loadPomodoroLogSince = (cutoff: number) =>
  loadSinceNumeric<PomodoroLogEntry>(
    "pomodoroLog", 
    "timestamp", 
    cutoff
  );

export async function countPomodoroLogByType(
  type: string
): Promise<number> {
  const exec = await requireExecutor("countPomodoroLogByType");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM pomodoroLog 
     WHERE json_extract(payload,'$.type') = ?`,
    [type],
  );
  return Number(rows[0]?.n ?? 0);
}

export const listAllCalibrationLog = (): 
  Promise<CalibrationEntry[]> => listAllAutoInc("calibrationLog");
  
export const countCalibrationLog = () => 
  countTable("calibrationLog");
  
const bulkPutCalibrationLog = (
  rows: readonly AutoIncRow<CalibrationEntry>[]
) =>
  bulkInsertAutoInc<CalibrationEntry>(
    "calibrationLog",
    rows,
    {
      cardId: (r) => r.cardId,
      timestamp: (r) => Number(r.timestamp ?? 0),
    },
    { preserveId: true },
  );

export const listAllLatencyLog = (): 
  Promise<LatencyEntry[]> => listAllAutoInc("latencyLog");
  
export const countLatencyLog = () => countTable("latencyLog");

const bulkPutLatencyLog = (
  rows: readonly AutoIncRow<LatencyEntry>[]
) =>
  bulkInsertAutoInc<LatencyEntry>(
    "latencyLog",
    rows,
    {
      cardId: (r) => r.cardId,
      timestamp: (r) => Number(r.timestamp ?? 0),
    },
    { preserveId: true },
  );

export const listAllSlippageLog = (): 
  Promise<SlippageEntry[]> => listAllAutoInc("slippageLog");
  
export const countSlippageLog = () => countTable("slippageLog");

const bulkPutSlippageLog = (
  rows: readonly AutoIncRow<SlippageEntry>[]
) =>
  bulkInsertAutoInc<SlippageEntry>(
    "slippageLog",
    rows,
    { 
      date: (r) => 
        (r as unknown as { date?: string }).date ?? "" 
    },
    { preserveId: true },
  );

export const listAllActivityLog = (): 
  Promise<ActivityEntry[]> => listAllAutoInc("activityLog");
  
export const countActivityLog = () => countTable("activityLog");

const bulkPutActivityLog = (
  rows: readonly AutoIncRow<ActivityEntry>[]
) =>
  bulkInsertAutoInc<ActivityEntry>(
    "activityLog",
    rows,
    { 
      timestamp: (r) => 
        Number((r as unknown as { 
          timestamp?: number 
        }).timestamp ?? 0) 
    },
    { preserveId: true },
  );

export async function listAllDiary(): Promise<DiaryEntry[]> {
  const exec = await requireExecutor("listAll:diary");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM diary ORDER BY date ASC"
  );
  return decode<DiaryEntry>(rows);
}
export const countDiary = () => countTable("diary");

// ── F6.2 helpers — windowed reads + single-row add + prune ───────

async function loadSinceNumeric<T>(
  table: string, col: string, since: number,
): Promise<T[]> {
  const exec = await requireExecutor(`loadSince:${table}`);
  if (!exec) return [];
  const rows = await exec.all<{ id: number; payload: string }>(
    `SELECT id, payload FROM ${table} 
     WHERE ${col} > ? ORDER BY id ASC`,
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
    `SELECT id, payload FROM ${table} 
     WHERE ${col} > ? ORDER BY id ASC`,
    [since],
  );
  return decode<T>(rows);
}

export const loadCalibrationLogSince = (cutoff: number) =>
  loadSinceNumeric<CalibrationEntry>(
    "calibrationLog", 
    "timestamp", 
    cutoff
  );
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

export async function pruneAutoIncTable(
  table: string, 
  maxRetain: number
): Promise<number> {
  const exec = await requireExecutor(`prune:${table}`);
  if (!exec) return 0;
  const countRow = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table}`
  );
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