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
  id: string;
  name: string;
  sortOrder: number;
}

export interface SubcategoryNode {
  id: string;
  name: string;
  chapters: ChapterNode[];
  sortOrder: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
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

export type SourceKind = "propis" | "skripta";

export interface Source {
  id: string;
  categoryId: string;
  title: string;
  date: string;
  htmlContent: string;
  outline: { id: string; text: string; level: number }[];
  articles: SourceArticle[];
  version: number;
  createdAt: number;
  updatedAt: number;
  officialGazetteInfo?: string;
  slMarkings?: string;
  isExclusive?: boolean;
  sourceKind?: SourceKind;
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
  categoryId?: string;
  title: string;
  mode: MindMapMode;
  nodes: MindMapNodeRecord[];
  edges: MindMapEdgeRecord[];
  createdAt: number;
  updatedAt: number;
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

    this.version(8).stores({
      mindMaps: "id, categoryId, title, updatedAt",
    });

    this.version(9).stores({
      cards: "id, categoryId, subcategoryId, type, createdAt, sourceId, [categoryId+subcategoryId]",
    });

    this.version(10).stores({
      mnemonics: "id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt",
      majorSystem: "id",
      mnemonicTestLog: "++id, cardId, timestamp",
    });

    this.version(11).stores({
      sources: "id, categoryId, title, version, createdAt, sourceKind, [categoryId+sourceKind]",
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

db.on("versionchange", () => {
  console.warn("[MemoriaDB] Another tab is trying to upgrade the database. Closing connection.");
  eventBus.emit(EVENT_TYPES.DB_BLOCKED);
  db.close();
});

// Watch for unblocking conditions — only start interval when error state is set
let reloadScheduled = false;
let unblockIntervalId: ReturnType<typeof setInterval> | null = null;

export function startUnblockWatch() {
  if (unblockIntervalId) return; // already running
  unblockIntervalId = setInterval(() => {
    if (!dbErrorState) {
      clearInterval(unblockIntervalId!);
      unblockIntervalId = null;
      return;
    }
    if (dbErrorState.type === "timeout" && eventBus.getTabCount() <= 1) {
      if (import.meta.env.DEV) console.log("[MemoriaDB] Only one tab remains, clearing blocked state...");
      dbErrorState = null;
      eventBus.emit(EVENT_TYPES.DB_UNBLOCKED);
      clearInterval(unblockIntervalId!);
      unblockIntervalId = null;
      if (!reloadScheduled) {
        reloadScheduled = true;
        setTimeout(() => window.location.reload(), 1000);
      }
    }
  }, 2000);
}

/**
 * Open database. On VersionError/UpgradeError, delete DB and reopen fresh.
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
          return false;
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

        setTimeout(() => {
          if (dbErrorState?.type === "timeout" && !reloadScheduled) {
            reloadScheduled = true;
            console.log("[MemoriaDB] Blocked timeout (30s), reloading...");
            window.location.reload();
          }
        }, 30000);
      }
      return false;
    }
  };

  let ok = await tryOpen();
  if (!ok && !dbErrorState) {
    try {
      await new Promise(r => setTimeout(r, 200));
      ok = await tryOpen();
    } catch {
      dbErrorState = { type: "version", message: "Nije moguće otvoriti bazu nakon resetovanja." };
      return false;
    }
  }

  return ok;
}
