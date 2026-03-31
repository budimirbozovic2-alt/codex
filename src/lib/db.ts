import Dexie, { type Table } from "dexie";
import { Card } from "./spaced-repetition";
import { ReviewLogEntry, PomodoroLogEntry } from "./storage";
import type { DiaryEntry, CalibrationEntry, LatencyEntry, SlippageEntry, ActivityEntry } from "./metacognitive-storage";
import type { DisciplineEntry } from "./planner-storage";
import { eventBus, EVENT_TYPES } from "./event-bus";
import { MnemonicCard, MnemonicTestLogEntry } from "./mnemonic-storage";

// ─── Global DB error state (reactive signal for UI) ─────
export let dbErrorState: { type: "version" | "timeout"; message: string } | null = null;
export function getDbErrorState() { return dbErrorState; }

// ─── Database Schema ────────────────────────────────────

export interface ChapterNode {
  id: string;          // UUID
  name: string;
  sortOrder: number;
}

export interface SubcategoryNode {
  id: string;          // UUID
  name: string;
  chapters: ChapterNode[];
  sortOrder: number;
}

export interface CategoryRecord {
  id: string;           // UUID
  name: string;         // display name
  sortOrder: number;
  subcategories: SubcategoryNode[];
  color?: string;
}

export interface SourceArticle {
  id: string;
  number: number;
  title: string;
  text: string;
}

export interface Source {
  id: string;
  categoryId: string;       // FK → categories.id (REQUIRED)
  title: string;             // was "label"
  date: string;
  htmlContent: string;
  outline: { id: string; text: string; level: number }[];
  articles: SourceArticle[];
  version: number;
  createdAt: number;
  updatedAt: number;
  // Registry-absorbed fields:
  officialGazetteInfo?: string;
  slMarkings?: string;
  isExclusive?: boolean;
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
  categoryId?: string;       // FK → categories.id (optional — global maps have no category)
  title: string;
  mode: MindMapMode;
  nodes: MindMapNodeRecord[];
  edges: MindMapEdgeRecord[];
  createdAt: number;
  updatedAt: number;
}

// ─── Default Categories ─────────────────────────────────

export const DEFAULT_CATEGORIES: { name: string; color?: string }[] = [
  { name: "Krivično materijalno pravo", color: "hsl(0, 70%, 50%)" },
  { name: "Krivično procesno pravo", color: "hsl(20, 70%, 50%)" },
  { name: "Građansko materijalno pravo", color: "hsl(210, 70%, 50%)" },
  { name: "Građansko procesno pravo", color: "hsl(180, 70%, 50%)" },
  { name: "Upravno pravo", color: "hsl(270, 70%, 50%)" },
  { name: "Privredno pravo", color: "hsl(150, 70%, 50%)" },
  { name: "Radno pravo", color: "hsl(45, 70%, 50%)" },
  { name: "Ustavno pravo i organizacija pravosuđa", color: "hsl(300, 70%, 50%)" },
  { name: "Konvencijsko pravo", color: "hsl(330, 70%, 50%)" },
];

export function createDefaultCategories(): CategoryRecord[] {
  return DEFAULT_CATEGORIES.map((c, i) => ({
    id: crypto.randomUUID(),
    name: c.name,
    sortOrder: i,
    subcategories: [],
    color: c.color,
  }));
}

// ─── Module-level blocked handler (registered once, no accumulation) ──
let _blockedReject: ((err: Error) => void) | null = null;

class MemoriaDB extends Dexie {
  categories!: Table<CategoryRecord, string>;
  cards!: Table<Card, string>;
  sources!: Table<Source, string>;
  reviewLog!: Table<ReviewLogEntry & { id?: number }, number>;
  pomodoroLog!: Table<PomodoroLogEntry & { id?: number }, number>;
  settings!: Table<{ key: string; value: unknown }, string>;
  diary!: Table<DiaryEntry, string>;
  calibrationLog!: Table<CalibrationEntry & { id?: number }, number>;
  latencyLog!: Table<LatencyEntry & { id?: number }, number>;
  slippageLog!: Table<SlippageEntry & { id?: number }, number>;
  activityLog!: Table<ActivityEntry & { id?: number }, number>;
  disciplineLog!: Table<DisciplineEntry & { id?: number }, number>;
  mindMaps!: Table<MindMapDoc, string>;
  mnemonics!: Table<MnemonicCard, string>;
  majorSystem!: Table<{ id: number; peg: string }, number>;
  mnemonicTestLog!: Table<MnemonicTestLogEntry & { id?: number }, number>;

  constructor() {
    super("MemoriaDB");

    // v7: Clean-slate CODEX v2.0 schema
    this.version(7).stores({
      categories: "id, name, sortOrder",
      cards: "id, categoryId, subcategory, type, createdAt, sourceId, [categoryId+subcategory]",
      sources: "id, categoryId, title, version, createdAt",
      reviewLog: "++id, cardId, sectionId, timestamp",
      pomodoroLog: "++id, timestamp, type",
      settings: "key",
      diary: "id, date",
      calibrationLog: "++id, timestamp, cardId",
      latencyLog: "++id, timestamp, cardId",
      slippageLog: "++id, date",
      activityLog: "++id, timestamp, type",
      disciplineLog: "++id, date",
      mindMaps: "id, title, updatedAt",
    });

    // v8: Add categoryId index to mindMaps for category-scoped gallery
    this.version(8).stores({
      mindMaps: "id, categoryId, title, updatedAt",
    });
    // v9: Add subcategoryId index to cards for UUID-based subcategory taxonomy
    this.version(9).stores({
      cards: "id, categoryId, subcategoryId, type, createdAt, sourceId, [categoryId+subcategoryId]",
    });

    // v10: Add mnemonic system tables
    this.version(10).stores({
      mnemonics: "id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt",
      majorSystem: "id",
      mnemonicTestLog: "++id, cardId, timestamp",
    });
  }
}

export const db = new MemoriaDB();

// Register blocked handler ONCE at module level
db.on("blocked", () => {
  console.warn("[MemoriaDB] DB open blocked by another connection");
  eventBus.emit(EVENT_TYPES.DB_BLOCKED);
  _blockedReject?.(new Error("DB_BLOCKED"));
});

// Also handle versionchange (when another tab attempts an upgrade)
db.on("versionchange", () => {
  console.warn("[MemoriaDB] Another tab is trying to upgrade the database. Closing connection.");
  eventBus.emit(EVENT_TYPES.DB_BLOCKED);
  db.close();
});

// Watch for unblocking conditions (tab count dropping to 1)
setInterval(() => {
  if (dbErrorState?.type === "timeout" && eventBus.getTabCount() <= 1) {
    console.log("[MemoriaDB] Only one tab remains, attempting to clear blocked state...");
    dbErrorState = null;
    eventBus.emit(EVENT_TYPES.DB_UNBLOCKED);
    // Force a reload or retry if we were blocked
    if (window.location.reload) {
      setTimeout(() => window.location.reload(), 1000);
    }
  }
}, 2000);

/**
 * Open database. On VersionError/UpgradeError, delete DB and reopen fresh.
 * Clean Slate protocol: all old data is dropped.
 */
export async function ensureDbOpen(timeoutMs = 6000): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tryOpen = async (): Promise<boolean> => {
    try {
      await Promise.race([
        db.open(),
        new Promise<never>((_, reject) => {
          _blockedReject = reject;
          timer = setTimeout(() => reject(new Error("DB_OPEN_TIMEOUT")), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      _blockedReject = null;
      return true;
    } catch (err: unknown) {
      clearTimeout(timer);
      _blockedReject = null;
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[MemoriaDB] open failed:", e.name, e.message);

      if (e.name === "VersionError" || e.name === "UpgradeError") {
        console.warn("[MemoriaDB] Schema mismatch — executing Clean Slate reset");
        try {
          await Dexie.delete("MemoriaDB");
          // Re-create fresh instance by reopening
          return false; // Signal caller to retry
        } catch (delErr) {
          console.error("[MemoriaDB] Failed to delete DB for reset", delErr);
          dbErrorState = { type: "version", message: e.message };
          return false;
        }
      } else if (e.message === "DB_OPEN_TIMEOUT" || e.message === "DB_BLOCKED") {
        dbErrorState = {
          type: "timeout",
          message: e.message === "DB_BLOCKED"
            ? "Baza je blokirana od strane drugog taba. Zatvorite ostale tabove i osvježite."
            : "Baza podataka se nije otvorila u predviđenom roku.",
        };
        
        // Aggressive retry after 30s if still blocked
        setTimeout(() => {
          if (dbErrorState?.type === "timeout") {
            console.log("[MemoriaDB] Blocked timeout (30s) reached, retrying open...");
            window.location.reload();
          }
        }, 30000);
      }
      return false;
    }
  };

  // First attempt
  let ok = await tryOpen();
  if (!ok && !dbErrorState) {
    // C1 fix: Retry using the same singleton — don't create orphan connections
    try {
      // Small delay to let any blocked event settle
      await new Promise(r => setTimeout(r, 200));
      ok = await tryOpen();
    } catch {
      dbErrorState = { type: "version", message: "Nije moguće otvoriti bazu nakon resetovanja." };
      return false;
    }
  }

  return ok;
}

/**
 * Seed default categories if the table is empty.
 */
export async function seedDefaultCategories(): Promise<CategoryRecord[]> {
  const count = await db.categories.count();
  if (count > 0) {
    return db.categories.orderBy("sortOrder").toArray();
  }
  const defaults = createDefaultCategories();
  await db.categories.bulkPut(defaults);
  console.log(`[MemoriaDB] Seeded ${defaults.length} default categories`);
  return defaults;
}

// ─── Migration: no-op for v7 (clean slate) ─────────────
export async function migrateFromLocalStorage(): Promise<void> {
  // v7 clean slate — no migration needed
  // Clear old localStorage flags to prevent confusion
  try {
    localStorage.removeItem("idb-migrated-v1");
    localStorage.removeItem("idb-migrated-v2");
    localStorage.removeItem("codex-source-registry");
    localStorage.removeItem("codex-monument-types");
  } catch { /* ignore */ }
}

// ─── Async storage API ──────────────────────────────────

export async function idbLoadCards(): Promise<Card[]> {
  return db.cards.toArray();
}

function hasInnerQuotaError(err: unknown): boolean {
  if (typeof err !== "object" || err === null || !("inner" in err)) return false;
  const inner = (err as Record<string, unknown>).inner;
  return typeof inner === "object" && inner !== null && (inner as Record<string, unknown>).name === "QuotaExceededError";
}

export async function idbPutCard(card: Card): Promise<void> {
  try {
    await db.cards.put(card);
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "QuotaExceededError" || hasInnerQuotaError(err)) {
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
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    if (e.name === "QuotaExceededError" || hasInnerQuotaError(err)) {
      console.error("[MemoriaDB] Storage quota exceeded during bulk write", err);
      throw new Error("QUOTA_EXCEEDED");
    }
    throw err;
  }
}

export async function idbDeleteCard(id: string): Promise<void> {
  await db.cards.delete(id);
}

// ─── Categories (UUID-based) ────────────────────────────

export async function idbLoadCategories(): Promise<CategoryRecord[]> {
  return db.categories.orderBy("sortOrder").toArray();
}

export async function idbSaveCategory(cat: CategoryRecord): Promise<void> {
  await db.categories.put(cat);
}

export async function idbSaveCategories(cats: CategoryRecord[]): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    await db.categories.bulkPut(cats);
    const keepIds = new Set(cats.map(c => c.id));
    const allKeys = await db.categories.toCollection().primaryKeys();
    const toDelete = allKeys.filter(k => !keepIds.has(k as string));
    if (toDelete.length > 0) await db.categories.bulkDelete(toDelete);
  });
}

export async function idbDeleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

// ─── Review Log ─────────────────────────────────────────

export async function idbLoadReviewLog(): Promise<ReviewLogEntry[]> {
  return db.reviewLog.toArray();
}

export async function idbLoadRecentReviewLog(days: number = 90): Promise<ReviewLogEntry[]> {
  const cutoff = Date.now() - days * 86400000;
  return db.reviewLog.where("timestamp").aboveOrEqual(cutoff).toArray();
}

export async function idbCountReviewLog(): Promise<number> {
  return db.reviewLog.count();
}

export async function idbAddReviewLogEntry(entry: ReviewLogEntry): Promise<void> {
  await db.reviewLog.add(entry);
}

// ─── Settings ───────────────────────────────────────────

export async function idbLoadSettings<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}

export async function idbSaveSettings(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ─── Fast aggregation helpers ───────────────────────────

export async function idbCountCardsByCategory(categoryId: string): Promise<number> {
  return db.cards.where("categoryId").equals(categoryId).count();
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
