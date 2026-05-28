import Dexie, { type Table } from "dexie";
import { Card } from "./spaced-repetition";
import { ReviewLogEntry, PomodoroLogEntry } from "./types/logs";
import type { DiaryEntry, CalibrationEntry, LatencyEntry, SlippageEntry, ActivityEntry } from "./metacognitive-storage";
import type { DisciplineEntry } from "./planner-storage";
import type { MnemonicCard, MnemonicTestLogEntry } from "@/features/mnemonic";
import { logger } from "./logger";
import {
  setDbErrorState,
  startUnblockWatch,
  scheduleTimeoutReload,
  registerBlockedRejecter,
  unregisterBlockedRejecter,
  rejectAllBlocked,
  emitBlockedThrottled,
  getDbErrorState,
} from "./db-error";

// A1c Phase 2: error-state machinery, IoC emitter, and the unblock watchdog
// were extracted to `db-error.ts` (Dexie-free). React-side imports should
// route through there; this module now only ships the Dexie shell + open.
// Re-export the Dexie-free utilities for backwards compat during codemod.
export {
  setDbEventEmitter,
  setDbErrorState,
  getDbErrorState,
  startUnblockWatch,
  __teardownDbWatchdog,
  type DbErrorState,
} from "./db-error";

// ─── Domain types ───────────────────────────────────────
// Single source of truth lives in `db-types.ts` (Dexie-free). Re-export
// here for backwards compat until the A1c-4 final drop.
export type {
  ChapterNode,
  SubcategoryNode,
  ExaminerDifficulty,
  PreferredAnswerType,
  ExaminerProfile,
  CategoryRecord,
  SourceArticle,
  SourceKind,
  ExamQuestion,
  Source,
  MindMapMode,
  MindMapNodeData,
  MindMapNodeRecord,
  MindMapEdgeRecord,
  MindMapDoc,
  KnowledgeBaseArticle,
  DraftRecord,
} from "./db-types";
import type {
  CategoryRecord,
  Source,
  MindMapDoc,
  KnowledgeBaseArticle,
  DraftRecord,
} from "./db-types";



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
  drafts!: Table<DraftRecord, string>;
  // outbox table removed in v23 (A1a); see comment above OutboxRecord.

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

    // v19: `drafts` table — persisted in-progress edits for `useDraftAutosave`
    // ({ persistDraft: true }). Survives crash / tab close; boot recovery UI
    // reads pending rows and offers resume.
    this.version(19).stores({
      drafts: "key, source, updatedAt",
    });

    // v20: `outbox` table — write-ahead log for `persist-queue`. Replaces the
    // `sessionStorage["codex-flush-pending"]` flag with a real recovery
    // signal. Primary key `&cardId` enforces last-write-wins coalescing;
    // flush deletes the row atomically with the card mutation, so any row
    // present on boot represents a write that did NOT make it to the cards
    // table and must be re-applied.
    this.version(20).stores({
      outbox: "&cardId, ts",
    });

    // v21 — editor-v4 migration (PR-3). Aditivna `contentDoc` kolona na
    // Section[] (kartice), Source i KnowledgeBaseArticle. Polje NIJE
    // indeksirano — Dexie ne traži schema diff za neindeksirane atribute,
    // pa je `stores({})` validan no-op koji samo bumpuje verziju.
    // Backfill je LAZY (vidi `src/lib/editor-v4/lazy-migrate.ts`) — upgrade
    // hook ne dira postojeće rekorde i ne kompromituje boot performanse.
    this.version(21).stores({});

    // v22 — PR-7c · destructive cleanup of legacy text columns.
    // Gated by preflight telemetry (`v4_telemetry_healthy=true` in localStorage),
    // which is set ONLY after lazy-migration reaches 100% AND a forced backup
    // succeeds. If the flag is missing, the upgrade hook bails (early return)
    // and the legacy columns survive untouched — the next boot retries
    // preflight. This guarantees we never drop data from unmigrated rows.
    this.version(22).stores({}).upgrade(async tx => {
      let healthy = false;
      try {
        healthy = typeof localStorage !== "undefined"
          && localStorage.getItem("v4_telemetry_healthy") === "true";
      } catch { /* localStorage unavailable in some envs */ }
      if (!healthy) {
        logger.warn("[MemoriaDB v22] preflight not healthy — skipping destructive cleanup");
        return;
      }
      // Strip legacy HTML/markdown columns now that AST is SSOT.
      await tx.table("cards").toCollection().modify((c: { sections?: Array<{ content?: unknown }> }) => {
        if (!Array.isArray(c.sections)) return;
        for (const s of c.sections) {
          if (s && "content" in s) delete s.content;
        }
      });
      await tx.table("sources").toCollection().modify((s: { htmlContent?: unknown }) => {
        if (s && "htmlContent" in s) delete s.htmlContent;
      });
      await tx.table("knowledgeBaseArticles").toCollection().modify((a: { content?: unknown }) => {
        if (a && "content" in a) delete a.content;
      });
      logger.log("[MemoriaDB v22] legacy text columns dropped");
export const db = new MemoriaDB();

// Register blocked handler ONCE at module level — uses the shared
// throttled emitter + rejecter set in `db-error.ts`.
db.on("blocked", () => {
  logger.warn("[MemoriaDB] DB open blocked by another connection");
  emitBlockedThrottled();
  rejectAllBlocked(new Error("DB_BLOCKED"));
});

db.on("versionchange", () => {
  logger.warn("[MemoriaDB] Another tab is trying to upgrade the database. Closing connection.");
  emitBlockedThrottled();
  db.close();
});

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
          registerBlockedRejecter(reject);
          timer = setTimeout(() => reject(new Error("DB_OPEN_TIMEOUT")), timeoutMs);
        }),
      ]);
      clearTimeout(timer);
      if (rejecter) unregisterBlockedRejecter(rejecter);
      return true;
    } catch (err: unknown) {
      clearTimeout(timer);
      if (rejecter) unregisterBlockedRejecter(rejecter);
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
        scheduleTimeoutReload(30000);
        startUnblockWatch();
      }
      return false;
    }
  };

  let ok = await tryOpen();
  if (!ok && !getDbErrorState()) {
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
  import.meta.hot.dispose(async () => {
    const { __teardownDbWatchdog } = await import("./db-error");
    __teardownDbWatchdog();
  });
}

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
