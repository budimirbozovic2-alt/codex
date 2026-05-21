import Dexie, { type Table } from "dexie";
import { Card } from "./spaced-repetition";
import { ReviewLogEntry, PomodoroLogEntry } from "./types/logs";
import type { DiaryEntry, CalibrationEntry, LatencyEntry, SlippageEntry, ActivityEntry } from "./metacognitive-storage";
import type { DisciplineEntry } from "./planner-storage";
import { EVENT_TYPES, type EventType } from "./event-bus-types";
import type { MnemonicCard, MnemonicTestLogEntry } from "@/features/mnemonic";

// ─── W1: Inversion-of-Control emitter ─────────────────────
// `db-schema` does NOT import the EventBus instance — instead, the bootstrap
// (src/main.tsx) injects an emitter via `setDbEventEmitter`. This breaks the
// `db-schema` ↔ `event-bus` cycle and makes calls debuggable by name.
type DbEmitter = (type: EventType, payload?: unknown) => void;
type TabCounter = () => number;
let _emit: DbEmitter = () => { /* no-op default (SSR / test without bus) */ };
let _getTabCount: TabCounter = () => 1;
export function setDbEventEmitter(emit: DbEmitter, getTabCount?: TabCounter): void {
  _emit = emit;
  if (getTabCount) _getTabCount = getTabCount;
}

// ─── Global DB error state (reactive signal for UI) ─────
// Module-level snapshot for early-boot async callers (no React context yet).
// All set/clear operations MUST go through `setDbErrorState` so that the
// React-side `DbErrorProvider` (subscribed to DB_ERROR_CHANGED) stays in sync.
export type DbErrorState = { type: "version" | "timeout"; message: string } | null;
export let dbErrorState: DbErrorState = null;
export function getDbErrorState(): DbErrorState { return dbErrorState; }
export function setDbErrorState(next: DbErrorState): void {
  dbErrorState = next;
  try { _emit(EVENT_TYPES.DB_ERROR_CHANGED, next); } catch { /* noop */ }
}

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

export type ExaminerDifficulty = "tezak" | "lak";
export type PreferredAnswerType = "esej" | "definicija" | "potpitanja";

export interface ExaminerProfile {
  difficulty?: ExaminerDifficulty;
  preferredAnswerType?: PreferredAnswerType;
  notes?: string;
  updatedAt?: number;
}

export interface CategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
  subcategories: SubcategoryNode[];
  color?: string;
  examinerProfile?: ExaminerProfile;
}

export interface SourceArticle {
  id: string;
  number: number;
  title: string;
  text: string;
}

export type SourceKind = "propis" | "skripta";

/** Per-source exam-question state (W3): persisted on the Source record itself
 *  so the user's mapping progress survives reload, navigation, and app quit. */
export interface ExamQuestion {
  id: string;
  text: string;
  done: boolean;
  moduleCount?: number;
}

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
  /** Per-source exam questions (pending + done). Optional — older records lack it. */
  examQuestions?: ExamQuestion[];
}

export type MindMapMode = "hierarchy" | "procedure";

export interface MindMapNodeData {
  label?: string;
  shape?: string;
  colorTheme?: string;
  [key: string]: unknown;
}

// `style` and `label` widened to match @xyflow/react's `Node` / `Edge` shapes
// so persisted records and live canvas state are mutually assignable without
// `as any` casts at the IDB boundary.
import type { CSSProperties, ReactNode } from "react";

import { logger } from "@/lib/logger";
export interface MindMapNodeRecord {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: MindMapNodeData;
  style?: CSSProperties;
  [key: string]: unknown;
}

export interface MindMapEdgeRecord {
  id: string;
  source: string;
  target: string;
  type?: string;
  label?: ReactNode;
  style?: CSSProperties;
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

export interface KnowledgeBaseArticle {
  id: string;
  subjectId: string;          // === categoryId
  title: string;
  content: string;            // markdown
  linkedSourceIds: string[];
  rootSubcategoryId?: string;
  /** True for the per-subject "Index" article (entry-point). Cannot be deleted. */
  isIndex?: boolean;
  /**
   * Lightweight, free-form tags used purely as Explorer-side filters.
   * They do NOT impose any structure on the Zettelkasten — articles can
   * exist without any tags, tags can exist on a single article, and they
   * never feed search, navigation, or persistence beyond the panel filter.
   * Always normalized: lowercase, trimmed, no `#` prefix, deduped.
   */
  tags?: string[];
  /**
   * Case-form synonyms (e.g. "krivičnog djela" for the article
   * "Krivično djelo"). The backlink index treats each alias as a secondary
   * key that resolves to the article's canonical title; the auto-link
   * pipeline uses them to suppress duplicate placeholder creation.
   * Always normalized: lowercase, trimmed, no wiki-link metachars, deduped.
   * See `src/lib/zettelkasten-aliases.ts` for the normalization contract.
   */
  aliases?: string[];
  createdAt: number;
  updatedAt: number;
}

// V7: Set of pending rejecters. Single-slot lost concurrent open() calls.
const _blockedRejecters = new Set<(err: Error) => void>();

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
  knowledgeBaseArticles!: Table<KnowledgeBaseArticle, string>;

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

    this.version(12).stores({
      cards: "id, categoryId, subcategoryId, type, createdAt, sourceId, frequencyTag, sourceType, [categoryId+subcategoryId]",
    });

    // v13 marker: examinerProfile added as embedded optional field on CategoryRecord (no index change)
    this.version(13).stores({
      categories: "id, name, sortOrder",
    });

    // v14: Zettelkasten knowledge base articles per subject
    this.version(14).stores({
      knowledgeBaseArticles: "id, subjectId, title, updatedAt, [subjectId+title]",
    });

    // v15: chapter-level indexes for HealthMonitor / SessionFilters / org-mode queries
    this.version(15).stores({
      cards: "id, categoryId, subcategoryId, chapterId, type, createdAt, sourceId, frequencyTag, sourceType, [categoryId+subcategoryId], [categoryId+chapterId], [subcategoryId+chapterId]",
    });

    // v16: drop unused secondary indexes (frequencyTag, sourceType, chapterId,
    // [categoryId+chapterId], [subcategoryId+chapterId]). All filtering on these
    // fields is in-memory; the indexes only added write-amplification on every
    // card mutation. Dexie drops the obsolete indexes automatically on upgrade.
    this.version(16).stores({
      cards: "id, categoryId, subcategoryId, type, createdAt, sourceId, [categoryId+subcategoryId]",
    });

    // v17: re-add chapter-level composite index [categoryId+chapterId] (Audit #7)
    // to enable efficient server-side filtering without loading all category cards.
    this.version(17).stores({
      cards: "id, categoryId, subcategoryId, chapterId, type, createdAt, sourceId, [categoryId+subcategoryId], [categoryId+chapterId]",
    });

    // v18 — Phase 0 of IDB-as-SSOT migration:
    //   • [categoryId+type]   — Essay/Flash filtering scoped to a subject.
    //   • [sourceId+createdAt] — ordered "cards by source" reads (SourceReader hot path).
    //   • *tags  (MultiEntry) — tag-based filtering without scanning every card.
    // Card has no top-level `nextReview`/`status` (those live per-section),
    // so the plan's [categoryId+nextReview] / [categoryId+status] are not
    // applicable at the card-row level and are intentionally omitted.
    this.version(18).stores({
      cards: "id, categoryId, subcategoryId, chapterId, type, createdAt, sourceId, [categoryId+subcategoryId], [categoryId+chapterId], [categoryId+type], [sourceId+createdAt], *tags",
    });
  }
}

export const db = new MemoriaDB();

// M5: Debounce DB_BLOCKED bursts (Dexie can fire `blocked` repeatedly when
// multiple connections pile up). 250 ms edge window collapses bursts into one.
let _lastBlockedEmitAt = 0;
function emitBlockedThrottled() {
  const now = Date.now();
  if (now - _lastBlockedEmitAt < 250) return;
  _lastBlockedEmitAt = now;
  _emit(EVENT_TYPES.DB_BLOCKED);
}

// Register blocked handler ONCE at module level
db.on("blocked", () => {
  logger.warn("[MemoriaDB] DB open blocked by another connection");
  emitBlockedThrottled();
  for (const r of _blockedRejecters) {
    try { r(new Error("DB_BLOCKED")); } catch { /* noop */ }
  }
  _blockedRejecters.clear();
});

db.on("versionchange", () => {
  logger.warn("[MemoriaDB] Another tab is trying to upgrade the database. Closing connection.");
  emitBlockedThrottled();
  db.close();
});

// Watch for unblocking conditions — only start interval when error state is set
let reloadScheduled = false;
let unblockIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Phase C / P2-2: stop and reset the unblock watchdog. Exposed so HMR can
 * dispose the stale `setInterval` before the module re-evaluates — otherwise
 * Vite leaves orphaned timers ticking every 2s across reloads.
 */
export function __teardownDbWatchdog(): void {
  if (unblockIntervalId !== null) {
    clearInterval(unblockIntervalId);
    unblockIntervalId = null;
  }
  reloadScheduled = false;
}

export function startUnblockWatch() {
  if (unblockIntervalId) return; // already running
  unblockIntervalId = setInterval(() => {
    if (!dbErrorState) {
      clearInterval(unblockIntervalId!);
      unblockIntervalId = null;
      return;
    }
    if (dbErrorState.type === "timeout" && _getTabCount() <= 1) {
      if (import.meta.env.DEV) logger.log("[MemoriaDB] Only one tab remains, clearing blocked state...");
      setDbErrorState(null);
      _emit(EVENT_TYPES.DB_UNBLOCKED);
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
    let rejecter: ((err: Error) => void) | null = null;
    try {
      await Promise.race([
        db.open(),
        new Promise<never>((_, reject) => {
          rejecter = reject;
          _blockedRejecters.add(reject);
          timer = setTimeout(() => reject(new Error("DB_OPEN_TIMEOUT")), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      if (rejecter) _blockedRejecters.delete(rejecter);
      return true;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (rejecter) _blockedRejecters.delete(rejecter);
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error("[MemoriaDB] open failed:", e.name, e.message);

      if (e.name === "VersionError" || e.name === "UpgradeError") {
        logger.warn("[MemoriaDB] Schema mismatch — executing Clean Slate reset");
        try {
          await Dexie.delete("MemoriaDB");
          return false;
        } catch (delErr) {
          logger.error("[MemoriaDB] Failed to delete DB for reset", delErr);
          setDbErrorState({ type: "version", message: e.message });
          startUnblockWatch();
          return false;
        }
      } else if (e.message === "DB_OPEN_TIMEOUT" || e.message === "DB_BLOCKED") {
        setDbErrorState({
          type: "timeout",
          message: e.message === "DB_BLOCKED"
            ? "Baza je blokirana od strane drugog taba. Zatvorite ostale tabove i osvježite."
            : "Baza podataka se nije otvorila u predviđenom roku.",
        });

        setTimeout(() => {
          if (dbErrorState?.type === "timeout" && !reloadScheduled) {
            reloadScheduled = true;
            logger.log("[MemoriaDB] Blocked timeout (30s), reloading...");
            window.location.reload();
          }
        }, 30000);
        startUnblockWatch();
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
      setDbErrorState({ type: "version", message: "Nije moguće otvoriti bazu nakon resetovanja." });
      startUnblockWatch();
      return false;
    }
  }

  return ok;
}

// Phase C / P2-2: HMR teardown so Vite reload doesn't leak watchdog intervals.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    __teardownDbWatchdog();
  });
}
