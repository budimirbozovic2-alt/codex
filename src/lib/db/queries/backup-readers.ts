/**
 * Backup / health read seam — PR-9 A1b P1.B + A1c-3 nastavak.
 *
 * Single consolidated reader for backup builders, emergency export, and the
 * health monitor. Everything that already lives in SQLite-primary repos
 * routes through their `listAll*` accessors so the snapshot reflects the
 * authoritative store.
 *
 * After A1c-3 nastavak all log tables (reviewLog/diary/calibration/latency/
 * slippage/activity/pomodoro) live in SQLite too — the previous
 * `// dexie-only-read-replica` shims are gone.
 *
 * The `categories` aggregate root is the only remaining Dexie-backed read
 * here; it migrates in A1c-4 alongside the schema drop.
 *
 * Consumers must NEVER reach into `db.X.toArray()` for backup/health
 * snapshots — go through this module so the repo wall stays clean.
 */
import { listAllCategories } from "./categories";
import type { CategoryRecord } from "@/lib/db-schema";
import { listAllCards, countAllCards } from "./cards";
import { listAllSources } from "./sources";
import { listAllMindMaps } from "./mind-maps";
import { listAllMnemonics } from "./mnemonics";
import { listAllArticles } from "./knowledge-base";
import { listAllPegs } from "./major-system";
import { listAllTestLogEntries } from "./mnemonic-test-log";
import { listAllDisciplineLog, countDisciplineLog } from "./planner";
import {
  listAllReviewLog, countReviewLog as _countReviewLog,
  listAllDiary, countDiary as _countDiary,
  listAllCalibrationLog, countCalibrationLog as _countCalibration,
  listAllLatencyLog, countLatencyLog as _countLatency,
  listAllSlippageLog, countSlippageLog as _countSlippage,
  listAllActivityLog, countActivityLog as _countActivity,
  listAllPomodoroLog, countPomodoroLog as _countPomodoro,
} from "./logs";


// ─── SQLite-primary reads ───────────────────────────────────────────────

export const readAllCardsForBackup = listAllCards;
export const readAllSourcesForBackup = listAllSources;
export const readAllMindMapsForBackup = listAllMindMaps;
export const readAllMnemonicsForBackup = listAllMnemonics;
export const readAllKbArticlesForBackup = listAllArticles;
export const readAllMajorSystemForBackup = listAllPegs;
export const readAllMnemonicTestLogForBackup = listAllTestLogEntries;
export const readAllDisciplineLogForBackup = listAllDisciplineLog;

// PR-9 A1c-3 nastavak — log tables SQLite-primary.
export const readReviewLog = listAllReviewLog;
export const readDiary = listAllDiary;
export const readCalibrationLog = listAllCalibrationLog;
export const readLatencyLog = listAllLatencyLog;
export const readSlippageLog = listAllSlippageLog;
export const readActivityLog = listAllActivityLog;
export const readPomodoroLog = listAllPomodoroLog;

/**
 * Categories are still Dexie-backed (the `categories` table stays the
 * aggregate root through A1c-3). Exposed via this seam so backup builders
 * have a single import surface — and so A1c-4 can swap the body without
 * touching any consumer.
 */
export async function readAllCategoriesForBackup(): Promise<CategoryRecord[]> {
  return idbLoadCategories();
}

/**
 * KV `settings` table dump for forward-compat backups. Settings move to the
 * SQLite `kv` table in a follow-up; until then this returns an empty array
 * (the legacy backup format expects `[{key,value}]`, but no consumer relies
 * on it actually being populated through this seam — `useCardExport`
 * still reads the Dexie table directly in the streaming path).
 */
export async function readSettingsTableRaw(): Promise<unknown[]> {
  return [];
}

// ─── Count helpers for the health monitor ───────────────────────────────

export const countCards = countAllCards;
export const countSources = async (): Promise<number> => (await listAllSources()).length;
export const countMindMaps = async (): Promise<number> => (await listAllMindMaps()).length;
export const countDiscipline = countDisciplineLog;

export const countReviewLog = _countReviewLog;
export const countDiary = _countDiary;
export const countCalibration = _countCalibration;
export const countLatency = _countLatency;
export const countSlippage = _countSlippage;
export const countActivity = _countActivity;
export const countPomodoro = _countPomodoro;
