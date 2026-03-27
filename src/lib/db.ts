import Dexie, { type Table } from "dexie";
import { Card } from "./spaced-repetition";
import { ReviewLogEntry, PomodoroLogEntry, LearnCardProgress } from "./storage";
import type { DiaryEntry, CalibrationEntry, LatencyEntry, SlippageEntry, ActivityEntry } from "./metacognitive-storage";
import type { PlannerConfig, DisciplineEntry } from "./planner-storage";

// ─── Database Schema ────────────────────────────────────
export interface SourceArticle {
  id: string;
  number: number;
  title: string;
  text: string;
}

export type MindMapMode = "hierarchy" | "procedure";

export interface MindMapNodeData {
  label?: string;
  shape?: string;
  colorTheme?: string;
  [key: string]: unknown;
}

export interface MindMapNodeRecord {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: MindMapNodeData;
  style?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MindMapEdgeRecord {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: string;
  style?: Record<string, unknown>;
  animated?: boolean;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MindMapDoc {
  id: string;
  title: string;
  mode: MindMapMode;
  nodes: MindMapNodeRecord[];
  edges: MindMapEdgeRecord[];
  createdAt: number;
  updatedAt: number;
}

export interface Source {
  id: string;
  label: string;
  date: string;           // ISO date string
  htmlContent: string;
  outline: { id: string; text: string; level: number }[];
  articles: SourceArticle[];
  version: number;
  createdAt: number;
  updatedAt: number;
  previousVersionId?: string;
  previousHtmlContent?: string; // stored for diff comparison
  officialGazetteInfo?: string; // e.g. "Službenom listu CG, br. 56/2014, 20/2015..."
}

class MemoriaDB extends Dexie {
  cards!: Table<Card, string>;
  categories!: Table<{ id: string; name: string }, string>;
  subcategories!: Table<{ id: string; category: string; subs: string[] }, string>;
  reviewLog!: Table<ReviewLogEntry & { id?: number }, number>;
  pomodoroLog!: Table<PomodoroLogEntry & { id?: number }, number>;
  settings!: Table<{ key: string; value: any }, string>;
  // v2: metacognitive + planner tables
  diary!: Table<DiaryEntry, string>;
  calibrationLog!: Table<CalibrationEntry & { id?: number }, number>;
  latencyLog!: Table<LatencyEntry & { id?: number }, number>;
  slippageLog!: Table<SlippageEntry & { id?: number }, number>;
  activityLog!: Table<ActivityEntry & { id?: number }, number>;
  disciplineLog!: Table<DisciplineEntry & { id?: number }, number>;
  // v3: sources
  sources!: Table<Source, string>;
  mindMaps!: Table<MindMapDoc, string>;

  constructor() {
    super("MemoriaDB");
    this.version(1).stores({
      cards: "id, category, subcategory, type, createdAt",
      categories: "id, name",
      subcategories: "id, category",
      reviewLog: "++id, cardId, sectionId, timestamp, category",
      pomodoroLog: "++id, timestamp, type",
      settings: "key",
    });
    this.version(2).stores({
      cards: "id, category, subcategory, type, createdAt",
      categories: "id, name",
      subcategories: "id, category",
      reviewLog: "++id, cardId, sectionId, timestamp, category",
      pomodoroLog: "++id, timestamp, type",
      settings: "key",
      diary: "id, date",
      calibrationLog: "++id, timestamp, cardId",
      latencyLog: "++id, timestamp, cardId",
      slippageLog: "++id, date",
      activityLog: "++id, timestamp, type",
      disciplineLog: "++id, date",
    });
    this.version(3).stores({
      cards: "id, category, subcategory, type, createdAt, sourceId",
      categories: "id, name",
      subcategories: "id, category",
      reviewLog: "++id, cardId, sectionId, timestamp, category",
      pomodoroLog: "++id, timestamp, type",
      settings: "key",
      diary: "id, date",
      calibrationLog: "++id, timestamp, cardId",
      latencyLog: "++id, timestamp, cardId",
      slippageLog: "++id, date",
      activityLog: "++id, timestamp, type",
      disciplineLog: "++id, date",
      sources: "id, label, version, createdAt",
    });
    this.version(4).stores({
      cards: "id, category, subcategory, type, createdAt, sourceId",
      categories: "id, name",
      subcategories: "id, category",
      reviewLog: "++id, cardId, sectionId, timestamp, category",
      pomodoroLog: "++id, timestamp, type",
      settings: "key",
      diary: "id, date",
      calibrationLog: "++id, timestamp, cardId",
      latencyLog: "++id, timestamp, cardId",
      slippageLog: "++id, date",
      activityLog: "++id, timestamp, type",
      disciplineLog: "++id, date",
      sources: "id, label, version, createdAt",
      mindMaps: "id, title, updatedAt",
    });
    // v5: add compound indexes for fast aggregation
    this.version(5).stores({
      cards: "id, category, subcategory, type, createdAt, sourceId, [category+subcategory]",
      categories: "id, name",
      subcategories: "id, category",
      reviewLog: "++id, cardId, sectionId, timestamp, category",
      pomodoroLog: "++id, timestamp, type",
      settings: "key",
      diary: "id, date",
      calibrationLog: "++id, timestamp, cardId",
      latencyLog: "++id, timestamp, cardId",
      slippageLog: "++id, date",
      activityLog: "++id, timestamp, type",
      disciplineLog: "++id, date",
      sources: "id, label, version, createdAt",
      mindMaps: "id, title, updatedAt",
    });
  }
}

export const db = new MemoriaDB();

/**
 * Explicitly open the database with a timeout guard.
 * Catches VersionError (stale schema) by deleting and re-opening.
 * Returns true if DB is usable, false if fallback mode should be used.
 */
export async function ensureDbOpen(timeoutMs = 6000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.open(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("DB_OPEN_TIMEOUT")), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    return true;
  } catch (err: any) {
    clearTimeout(timer);
    console.error("[MemoriaDB] open failed:", err?.name, err?.message);
    // VersionError = schema downgrade or corruption — delete and retry once
    if (err?.name === "VersionError" || err?.name === "UpgradeError") {
      try {
        await db.delete();
        await db.open();
        console.warn("[MemoriaDB] DB reset after VersionError — data cleared");
        return true;
      } catch (retryErr) {
        console.error("[MemoriaDB] retry after delete failed:", retryErr);
      }
    }
    return false;
  }
}

// ─── Migration: localStorage → IndexedDB (one-time) ─────
const MIGRATION_FLAG = "idb-migrated-v1";

export async function migrateFromLocalStorage(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  try {
    // Cards
    const cardsRaw = localStorage.getItem("sr-essay-cards");
    if (cardsRaw) {
      const cards: Card[] = JSON.parse(cardsRaw);
      if (cards.length > 0) {
        await db.cards.bulkPut(cards);
      }
    }

    // Categories
    const catsRaw = localStorage.getItem("sr-essay-categories");
    if (catsRaw) {
      const cats: string[] = JSON.parse(catsRaw);
      await db.categories.bulkPut(cats.map(name => ({ id: name, name })));
    }

    // Subcategories
    const subsRaw = localStorage.getItem("sr-essay-subcategories");
    if (subsRaw) {
      const subs: Record<string, string[]> = JSON.parse(subsRaw);
      await db.subcategories.bulkPut(
        Object.entries(subs).map(([category, subList]) => ({
          id: category,
          category,
          subs: subList,
        }))
      );
    }

    // Review log
    const logRaw = localStorage.getItem("sr-review-log");
    if (logRaw) {
      const log: ReviewLogEntry[] = JSON.parse(logRaw);
      if (log.length > 0) {
        await db.reviewLog.bulkAdd(log);
      }
    }

    // SR Settings
    const settingsRaw = localStorage.getItem("sr-settings");
    if (settingsRaw) {
      await db.settings.put({ key: "srSettings", value: JSON.parse(settingsRaw) });
    }

    // Pomodoro log
    const pomRaw = localStorage.getItem("sr-pomodoro-log");
    if (pomRaw) {
      const pomLog: PomodoroLogEntry[] = JSON.parse(pomRaw);
      if (pomLog.length > 0) {
        await db.pomodoroLog.bulkAdd(pomLog);
      }
    }

    localStorage.setItem(MIGRATION_FLAG, "1");
    // migration complete
  } catch (err) {
    console.error("[MemoriaDB] Migration failed, falling back to localStorage", err);
  }

  // v2 migration: metacognitive + planner
  const MIGRATION_V2_FLAG = "idb-migrated-v2";
  if (!localStorage.getItem(MIGRATION_V2_FLAG)) {
    try {
      // Diary
      const diaryRaw = localStorage.getItem("sr-metacognitive-diary");
      if (diaryRaw) {
        const entries = JSON.parse(diaryRaw);
        if (entries.length > 0) await db.diary.bulkPut(entries);
      }
      // Calibration
      const calRaw = localStorage.getItem("sr-calibration-log");
      if (calRaw) {
        const entries = JSON.parse(calRaw);
        if (entries.length > 0) await db.calibrationLog.bulkAdd(entries);
      }
      // Latency
      const latRaw = localStorage.getItem("sr-recall-latency");
      if (latRaw) {
        const entries = JSON.parse(latRaw);
        if (entries.length > 0) await db.latencyLog.bulkAdd(entries);
      }
      // Slippage
      const slipRaw = localStorage.getItem("sr-slippage-log");
      if (slipRaw) {
        const entries = JSON.parse(slipRaw);
        if (entries.length > 0) await db.slippageLog.bulkAdd(entries);
      }
      // Activity
      const actRaw = localStorage.getItem("sr-activity-log");
      if (actRaw) {
        const entries = JSON.parse(actRaw);
        if (entries.length > 0) await db.activityLog.bulkAdd(entries);
      }
      // Planner config
      const planRaw = localStorage.getItem("sr-planner-config");
      if (planRaw) {
        await db.settings.put({ key: "plannerConfig", value: JSON.parse(planRaw) });
      }
      // Discipline
      const discRaw = localStorage.getItem("sr-discipline-log");
      if (discRaw) {
        const entries = JSON.parse(discRaw);
        if (entries.length > 0) await db.disciplineLog.bulkAdd(entries);
      }
      // App entry & last analysis date → settings
      const appEntry = localStorage.getItem("sr-app-entry-time");
      if (appEntry) await db.settings.put({ key: "appEntry", value: JSON.parse(appEntry) });
      const lastAnalysis = localStorage.getItem("sr-last-analysis-date");
      if (lastAnalysis) await db.settings.put({ key: "lastAnalysisDate", value: lastAnalysis });

      localStorage.setItem(MIGRATION_V2_FLAG, "1");
      // v2 migration complete
    } catch (err) {
      console.error("[MemoriaDB] v2 migration failed", err);
    }
  }
}

// ─── Async storage API ──────────────────────────────────

export async function idbLoadCards(): Promise<Card[]> {
  return db.cards.toArray();
}

export async function idbSaveCards(cards: Card[]): Promise<void> {
  // Surgical upsert: bulkPut handles insert-or-update without clearing.
  // Then remove any cards in IDB that aren't in the new set.
  await db.transaction("rw", db.cards, async () => {
    if (cards.length > 0) {
      await db.cards.bulkPut(cards);
    }
    // Remove stale cards not in the new set
    const newIds = new Set(cards.map(c => c.id));
    const allKeys = await db.cards.toCollection().primaryKeys();
    const toDelete = allKeys.filter(k => !newIds.has(k as string));
    if (toDelete.length > 0) {
      await db.cards.bulkDelete(toDelete);
    }
  });
}

export async function idbPutCard(card: Card): Promise<void> {
  try {
    await db.cards.put(card);
  } catch (err: any) {
    if (err?.name === "QuotaExceededError" || err?.inner?.name === "QuotaExceededError") {
      console.error("[MemoriaDB] Storage quota exceeded", err);
      throw new Error("QUOTA_EXCEEDED");
    }
    throw err;
  }
}

export async function idbBulkPutCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return;
  try {
    await db.cards.bulkPut(cards);
  } catch (err: any) {
    if (err?.name === "QuotaExceededError" || err?.inner?.name === "QuotaExceededError") {
      console.error("[MemoriaDB] Storage quota exceeded during bulk write", err);
      throw new Error("QUOTA_EXCEEDED");
    }
    throw err;
  }
}

export async function idbDeleteCard(id: string): Promise<void> {
  await db.cards.delete(id);
}

export async function idbLoadCategories(): Promise<string[]> {
  const rows = await db.categories.toArray();
  return rows.length > 0 ? rows.map(r => r.name) : ["Opšte"];
}

export async function idbSaveCategories(cats: string[]): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    const newRows = cats.map(name => ({ id: name, name }));
    await db.categories.bulkPut(newRows);
    // Delete categories no longer in the list
    const keepIds = new Set(cats);
    const allKeys = await db.categories.toCollection().primaryKeys();
    const toDelete = allKeys.filter(k => !keepIds.has(k as string));
    if (toDelete.length > 0) await db.categories.bulkDelete(toDelete);
  });
}

export async function idbLoadSubcategories(): Promise<Record<string, string[]>> {
  const rows = await db.subcategories.toArray();
  const result: Record<string, string[]> = {};
  rows.forEach(r => { result[r.category] = r.subs; });
  return result;
}

export async function idbSaveSubcategories(subs: Record<string, string[]>): Promise<void> {
  await db.transaction("rw", db.subcategories, async () => {
    const newRows = Object.entries(subs).map(([category, subList]) => ({ id: category, category, subs: subList }));
    await db.subcategories.bulkPut(newRows);
    // Delete subcategories no longer present
    const keepIds = new Set(Object.keys(subs));
    const allKeys = await db.subcategories.toCollection().primaryKeys();
    const toDelete = allKeys.filter(k => !keepIds.has(k as string));
    if (toDelete.length > 0) await db.subcategories.bulkDelete(toDelete);
  });
}

export async function idbLoadReviewLog(): Promise<ReviewLogEntry[]> {
  return db.reviewLog.toArray();
}

/** Load only recent review log entries (last N days) for faster boot */
export async function idbLoadRecentReviewLog(days: number = 90): Promise<ReviewLogEntry[]> {
  const cutoff = Date.now() - days * 86400000;
  return db.reviewLog.where("timestamp").aboveOrEqual(cutoff).toArray();
}

/** Count total review log entries (for UI display without loading all) */
export async function idbCountReviewLog(): Promise<number> {
  return db.reviewLog.count();
}

export async function idbAddReviewLogEntry(entry: ReviewLogEntry): Promise<void> {
  await db.reviewLog.add(entry);
}

export async function idbLoadSettings<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}

export async function idbSaveSettings(key: string, value: any): Promise<void> {
  await db.settings.put({ key, value });
}

// ─── Fast aggregation helpers (cursor-based, no full toArray) ──
export async function idbCountCardsByCategory(category: string): Promise<number> {
  return db.cards.where("category").equals(category).count();
}

export async function idbCountAllCards(): Promise<number> {
  return db.cards.count();
}

export async function idbCountByType(type: string): Promise<number> {
  return db.cards.where("type").equals(type).count();
}

export async function idbCountReviewLogSince(since: number): Promise<number> {
  return db.reviewLog.where("timestamp").aboveOrEqual(since).count();
}
