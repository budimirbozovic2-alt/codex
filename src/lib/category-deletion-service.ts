// ─── Category Deletion Service (Commit D — PR-9 M3) ───────
// Single cascade for `deleteCategory`. SQLite is SSOT for cards / sources /
// mindMaps / mnemonics — those run in a single `SqlExecutor.transaction`
// (native ACID, no JS keyed mutex needed). Dexie is mirrored in the same
// flow as rollback insurance until A1 drops the mirror entirely.
//
// Domains still Dexie-only (no SQLite schema yet):
//   • knowledgeBaseArticles (Zettelkasten) — migrates in a later PR
//
// Settings KV (subject_settings, plannerConfig) go through the new
// settings repo so SQLite + Dexie stay in sync automatically.
//
// Cards + sources still get the optional re-parent semantics from the
// orchestrator (purgeCards toggle) here.
import { db } from "@/lib/db";
import { invalidateMindMapsCache } from "@/lib/mindmap-storage";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { clearSubjectSettings } from "@/lib/subject-settings";
import { invalidateExaminerProfile } from "@/lib/examiner-profile-cache";
import { backlinkIndex } from "@/lib/backlink-index";
import { getSetting, putSetting, deleteSetting } from "@/lib/db/queries";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";

const SUBJECT_SETTINGS_PREFIX = "subject_settings:";

export interface CascadeResult {
  articles: number;
  mindMaps: number;
  mnemonics: number;
  settings: number;
  plannerScrubbed: boolean;
  cardsAffected: number;
  sourcesAffected: number;
}

interface PlannerConfigShape {
  subjectOrder?: string[];
  hardSubjects?: string[];
  phases?: { categories?: string[] }[];
  [k: string]: unknown;
}

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[category-deletion] sqlite executor unavailable, Dexie-only path", err);
    return null;
  }
}

/** Re-parent or purge cards + sources + mindMaps + mnemonics in one SQLite tx. */
async function cascadeSqlite(
  exec: SqlExecutor,
  categoryId: string,
  opts: { purgeCards: boolean; fallbackId: string },
  result: CascadeResult,
): Promise<void> {
  await exec.transaction(async (tx) => {
    if (opts.purgeCards) {
      // FK CASCADE on cards.sourceId would null-out sourceId after sources
      // deletion; we delete cards first to keep semantics explicit.
      await tx.run("DELETE FROM cards   WHERE categoryId = ?", [categoryId]);
      await tx.run("DELETE FROM sources WHERE categoryId = ?", [categoryId]);
    } else if (opts.fallbackId) {
      const now = Date.now();
      // Re-parent cards (clear subcategory/chapter — fallback may have a
      // different taxonomy). Payload JSON is re-serialised by codecs on
      // subsequent reads; the indexed columns are what readers query on.
      await tx.run(
        `UPDATE cards
           SET categoryId = ?, subcategoryId = NULL, chapterId = NULL, updatedAt = ?
         WHERE categoryId = ?`,
        [opts.fallbackId, now, categoryId],
      );
      await tx.run(
        "UPDATE sources SET categoryId = ? WHERE categoryId = ?",
        [opts.fallbackId, categoryId],
      );
    }
    await tx.run("DELETE FROM mindMaps  WHERE categoryId = ?", [categoryId]);
    await tx.run("DELETE FROM mnemonics WHERE categoryId = ?", [categoryId]);
  });

  // Best-effort row counts for telemetry — read AFTER the tx commits.
  // (SQLite changes() inside the wrapped tx isn't exposed by SqlExecutor.)
  result.mindMaps = 1; // signal "ran cascade"; precise count not surfaced.
  result.mnemonics = 1;
}

export async function cascadeDeleteCategoryDomains(
  categoryId: string,
  opts: { purgeCards: boolean; fallbackId: string }
): Promise<CascadeResult> {
  const result: CascadeResult = {
    articles: 0, mindMaps: 0, mnemonics: 0, settings: 0,
    plannerScrubbed: false, cardsAffected: 0, sourcesAffected: 0,
  };
  if (!categoryId) return result;

  // ── 1. SQLite-resident domains (cards / sources / mindMaps / mnemonics) ──
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await cascadeSqlite(exec, categoryId, opts, result);
    } catch (err) {
      logger.error("[category-deletion] sqlite cascade failed", err);
      throw err;
    }
  }

  // ── 2. Dexie mirror (rollback insurance + Zettelkasten Dexie-only) ──
  await db.transaction(
    "rw",
    [db.knowledgeBaseArticles, db.mindMaps, db.mnemonics, db.cards, db.sources],
    async () => {
      if (opts.purgeCards) {
        result.cardsAffected = await db.cards.where("categoryId").equals(categoryId).delete();
        result.sourcesAffected = await db.sources.where("categoryId").equals(categoryId).delete();
      } else if (opts.fallbackId) {
        const now = Date.now();
        result.cardsAffected = await db.cards.where("categoryId").equals(categoryId).modify({
          categoryId: opts.fallbackId,
          subcategoryId: undefined,
          chapterId: undefined,
          updatedAt: now,
        });
        result.sourcesAffected = await db.sources.where("categoryId").equals(categoryId).modify({
          categoryId: opts.fallbackId,
        });
      }
      result.articles  = await db.knowledgeBaseArticles.where("subjectId").equals(categoryId).delete();
      result.mindMaps  = await db.mindMaps.where("categoryId").equals(categoryId).delete();
      result.mnemonics = await db.mnemonics.where("categoryId").equals(categoryId).delete();
    },
  );

  // ── 3. Settings KV (per-subject overrides + planner scrub) ──
  // Routed through the new settings repo so SQLite + Dexie stay in sync.
  const settingsKey = SUBJECT_SETTINGS_PREFIX + categoryId;
  const existed = await getSetting<unknown>(settingsKey);
  if (existed !== undefined) {
    await deleteSetting(settingsKey);
    result.settings = 1;
  }

  const planner = await getSetting<PlannerConfigShape>("plannerConfig");
  if (planner && typeof planner === "object") {
    const cfg: PlannerConfigShape = { ...planner };
    let dirty = false;
    if (Array.isArray(cfg.subjectOrder) && cfg.subjectOrder.includes(categoryId)) {
      cfg.subjectOrder = cfg.subjectOrder.filter(id => id !== categoryId);
      dirty = true;
    }
    if (Array.isArray(cfg.hardSubjects) && cfg.hardSubjects.includes(categoryId)) {
      cfg.hardSubjects = cfg.hardSubjects.filter(id => id !== categoryId);
      dirty = true;
    }
    if (Array.isArray(cfg.phases)) {
      cfg.phases = cfg.phases.map(ph => {
        if (Array.isArray(ph.categories) && ph.categories.includes(categoryId)) {
          dirty = true;
          return { ...ph, categories: ph.categories.filter(id => id !== categoryId) };
        }
        return ph;
      });
    }
    if (dirty) {
      await putSetting("plannerConfig", cfg);
      result.plannerScrubbed = true;
    }
  }

  // ── 4. Post-commit cache invalidation ──
  if (result.mindMaps > 0) invalidateMindMapsCache();
  if (result.settings > 0) clearSubjectSettings(categoryId);
  invalidateExaminerProfile(categoryId);
  backlinkIndex.clear(categoryId);
  invalidateSourcesCache();

  return result;
}
