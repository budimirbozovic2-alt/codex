import Dexie, { type Table } from "dexie";
import { Card } from "./spaced-repetition";
import { ReviewLogEntry, PomodoroLogEntry, LearnCardProgress } from "./storage";
import type { DiaryEntry, CalibrationEntry, LatencyEntry, SlippageEntry, ActivityEntry } from "./metacognitive-storage";
import type { PlannerConfig, DisciplineEntry } from "./planner-storage";

// ─── Database Schema ────────────────────────────────────
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
  }
}

export const db = new MemoriaDB();

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
    console.log("[MemoriaDB] Migration from localStorage complete");
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
      console.log("[MemoriaDB] v2 migration (metacognitive+planner) complete");
    } catch (err) {
      console.error("[MemoriaDB] v2 migration failed", err);
    }
  }
}

// Fix #3: Non-blocking localStorage sync helper
function deferredLocalStorageSync(key: string, data: () => string) {
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(() => {
      try { localStorage.setItem(key, data()); } catch {}
    }, { timeout: 5000 });
  } else {
    setTimeout(() => {
      try { localStorage.setItem(key, data()); } catch {}
    }, 200);
  }
}

// ─── Async storage API ──────────────────────────────────

export async function idbLoadCards(): Promise<Card[]> {
  return db.cards.toArray();
}

export async function idbSaveCards(cards: Card[]): Promise<void> {
  await db.transaction("rw", db.cards, async () => {
    await db.cards.clear();
    await db.cards.bulkPut(cards);
  });
  // Keep localStorage in sync for Electron auto-backup (non-blocking)
  deferredLocalStorageSync("sr-essay-cards", () => JSON.stringify(cards));
}

export async function idbPutCard(card: Card): Promise<void> {
  await db.cards.put(card);
}

export async function idbBulkPutCards(cards: Card[]): Promise<void> {
  if (cards.length === 0) return;
  await db.cards.bulkPut(cards);
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
    await db.categories.clear();
    await db.categories.bulkPut(cats.map(name => ({ id: name, name })));
  });
  deferredLocalStorageSync("sr-essay-categories", () => JSON.stringify(cats));
}

export async function idbLoadSubcategories(): Promise<Record<string, string[]>> {
  const rows = await db.subcategories.toArray();
  const result: Record<string, string[]> = {};
  rows.forEach(r => { result[r.category] = r.subs; });
  return result;
}

export async function idbSaveSubcategories(subs: Record<string, string[]>): Promise<void> {
  await db.transaction("rw", db.subcategories, async () => {
    await db.subcategories.clear();
    await db.subcategories.bulkPut(
      Object.entries(subs).map(([category, subList]) => ({ id: category, category, subs: subList }))
    );
  });
  deferredLocalStorageSync("sr-essay-subcategories", () => JSON.stringify(subs));
}

export async function idbLoadReviewLog(): Promise<ReviewLogEntry[]> {
  return db.reviewLog.toArray();
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
