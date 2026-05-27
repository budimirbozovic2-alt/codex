/**
 * Backup / health read seam — PR-9 A1b P1.B.
 *
 * Single consolidated reader for backup builders, emergency export, and the
 * health monitor. Everything that already lives in SQLite-primary repos
 * routes through their `listAll*` accessors so the snapshot reflects the
 * authoritative store (and falls back to Dexie only in the Vite dev preview
 * where the OPFS executor is absent).
 *
 * Tables that haven't migrated yet (review/diary/calibration/latency/
 * slippage/activity/pomodoro logs, plus the `categories` aggregate root) are
 * still read from Dexie — clearly labelled below so a future A1c sweep can
 * grep for `// dexie-only-read-replica` and finish the cut-over.
 *
 * Consumers must NEVER reach into `db.X.toArray()` for backup/health
 * snapshots — go through this module so the repo wall stays clean.
 */
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { idbLoadCategories } from "@/lib/db-queries";
import type { CategoryRecord } from "@/lib/db-schema";
import { listAllCards, countAllCards } from "./cards";
import { listAllSources } from "./sources";
import { listAllMindMaps } from "./mind-maps";
import { listAllMnemonics } from "./mnemonics";
import { listAllArticles } from "./knowledge-base";
import { listAllPegs } from "./major-system";
import { listAllTestLogEntries } from "./mnemonic-test-log";
import { listAllDisciplineLog, countDisciplineLog } from "./planner";

// ─── SQLite-primary reads ───────────────────────────────────────────────

export const readAllCardsForBackup = listAllCards;
export const readAllSourcesForBackup = listAllSources;
export const readAllMindMapsForBackup = listAllMindMaps;
export const readAllMnemonicsForBackup = listAllMnemonics;
export const readAllKbArticlesForBackup = listAllArticles;
export const readAllMajorSystemForBackup = listAllPegs;
export const readAllMnemonicTestLogForBackup = listAllTestLogEntries;
export const readAllDisciplineLogForBackup = listAllDisciplineLog;

/**
 * Categories are still Dexie-backed (the `categories` table stays the
 * aggregate root through A1c). Exposed via this seam so backup builders
 * have a single import surface — and so the A1c sweep can swap the body
 * without touching any consumer.
 */
export async function readAllCategoriesForBackup(): Promise<CategoryRecord[]> {
  return idbLoadCategories();
}

// ─── Dexie-only read replicas (logs, KV settings table) ─────────────────
// Each helper is async + try/catch so a backup never crashes on a transient
// IDB error — we surface an empty array and log instead. PR-9 A1c will
// migrate these tables and remove the helpers.

async function safeDexieReadAll<T>(label: string, read: () => Promise<T[]>): Promise<T[]> {
  try { return await read(); }
  catch (err) {
    logger.warn(`[backup-readers] dexie read failed: ${label}`, err);
    return [];
  }
}

// dexie-only-read-replica
export const readReviewLog = () => safeDexieReadAll("reviewLog", () => db.reviewLog.toArray());
// dexie-only-read-replica
export const readDiary = () => safeDexieReadAll("diary", () => db.diary.toArray());
// dexie-only-read-replica
export const readCalibrationLog = () => safeDexieReadAll("calibrationLog", () => db.calibrationLog.toArray());
// dexie-only-read-replica
export const readLatencyLog = () => safeDexieReadAll("latencyLog", () => db.latencyLog.toArray());
// dexie-only-read-replica
export const readSlippageLog = () => safeDexieReadAll("slippageLog", () => db.slippageLog.toArray());
// dexie-only-read-replica
export const readActivityLog = () => safeDexieReadAll("activityLog", () => db.activityLog.toArray());
// dexie-only-read-replica
export const readPomodoroLog = () => safeDexieReadAll("pomodoroLog", () => db.pomodoroLog.toArray());
// dexie-only-read-replica — KV `settings` table; planner/srSettings already
// flow through `queries/settings.ts`. Used by backup builders that dump the
// full raw table for forward-compat.
export const readSettingsTableRaw = () => safeDexieReadAll(
  "settings",
  () => db.settings.toArray() as Promise<unknown[]>,
);

// ─── Count helpers for the health monitor ───────────────────────────────

async function safeDexieCount(label: string, count: () => Promise<number>): Promise<number> {
  try { return await count(); }
  catch (err) {
    logger.warn(`[backup-readers] dexie count failed: ${label}`, err);
    return 0;
  }
}

export const countCards = countAllCards;
export const countSources = async (): Promise<number> => (await listAllSources()).length;
export const countMindMaps = async (): Promise<number> => (await listAllMindMaps()).length;
export const countDiscipline = countDisciplineLog;

// dexie-only-read-replica
export const countReviewLog = () => safeDexieCount("reviewLog", () => db.reviewLog.count());
// dexie-only-read-replica
export const countDiary = () => safeDexieCount("diary", () => db.diary.count());
// dexie-only-read-replica
export const countCalibration = () => safeDexieCount("calibrationLog", () => db.calibrationLog.count());
// dexie-only-read-replica
export const countLatency = () => safeDexieCount("latencyLog", () => db.latencyLog.count());
// dexie-only-read-replica
export const countSlippage = () => safeDexieCount("slippageLog", () => db.slippageLog.count());
// dexie-only-read-replica
export const countActivity = () => safeDexieCount("activityLog", () => db.activityLog.count());
// dexie-only-read-replica
export const countPomodoro = () => safeDexieCount("pomodoroLog", () => db.pomodoroLog.count());
