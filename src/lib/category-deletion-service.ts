// ─── Category Deletion Service (A2 — collapsed) ──────────────────────────
// Single cascade entry-point for `deleteCategory`.
//
// SQLite path: one transaction inside `categoryRepository.deleteAsync` —
// re-parents (or purges) cards + sources, then `DELETE FROM categories`.
// FK CASCADE on the schema wipes mindMaps / mnemonics / knowledgeBaseArticles
// automatically. No JS keyed mutex needed — SQLite ACID is the only
// write-serialisation primitive (Core memory).
//
// Dexie mirror: every child-table tear-down goes through the per-domain
// `*ByCategoryDexie` helpers exposed from `@/lib/db/queries`. The service
// no longer imports `db` directly.
//
// KV scope (subject_settings, plannerConfig refs) has no FK relationship —
// scrubbed here explicitly.
import {
  invalidateMindMapsCache,
  onMindMapsChanged as _onMindMapsChanged,
} from "@/lib/mindmap-storage";
import { invalidateSourcesCache } from "@/lib/sources-storage";
import { clearSubjectSettings } from "@/lib/subject-settings";
import { invalidateExaminerProfile } from "@/lib/examiner-profile-cache";
import { backlinkIndex } from "@/lib/backlink-index";
import {
  getSetting,
  putSetting,
  deleteSetting,
  notifyCardsChanged,
  notifyKnowledgeBaseChanged,
  deleteCardsByCategoryDexie,
  reparentCardsByCategoryDexie,
  deleteSourcesByCategoryDexie,
  reparentSourcesByCategoryDexie,
  deleteMindMapsByCategoryDexie,
  deleteMnemonicsByCategoryDexie,
  deleteArticlesBySubjectDexie,
} from "@/lib/db/queries";
import { categoryRepository } from "@/lib/repositories";
import { notifyMnemonics } from "@/features/mnemonic/mnemonic-storage";
import { logger } from "@/lib/logger";

// Hint to bundler that the listener registry stays alive — bridges import
// the same module so this re-export is just a paranoia anchor.
void _onMindMapsChanged;

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

export async function cascadeDeleteCategoryDomains(
  categoryId: string,
  opts: { purgeCards: boolean; fallbackId: string },
): Promise<CascadeResult> {
  const result: CascadeResult = {
    articles: 0, mindMaps: 0, mnemonics: 0, settings: 0,
    plannerScrubbed: false, cardsAffected: 0, sourcesAffected: 0,
  };
  if (!categoryId) return result;

  // 1. SQLite — one tx (re-parent/purge cards+sources, then DELETE FROM
  //    categories → FK CASCADE on mindMaps/mnemonics/knowledgeBaseArticles).
  const sqlResult = await categoryRepository.deleteAsync(categoryId, opts);
  if (!sqlResult.ok) {
    logger.error("[category-deletion] sqlite cascade failed", sqlResult.error);
    throw new Error(sqlResult.error.message);
  }

  // 2. Dexie mirror — parallel per-domain helpers. SQLite already committed,
  //    so partial failures here only affect the soak-window mirror.
  const [cardsN, sourcesN, mindMapsN, mnemonicsN, articlesN] = await Promise.all([
    opts.purgeCards
      ? deleteCardsByCategoryDexie(categoryId)
      : opts.fallbackId
        ? reparentCardsByCategoryDexie(categoryId, opts.fallbackId)
        : Promise.resolve(0),
    opts.purgeCards
      ? deleteSourcesByCategoryDexie(categoryId)
      : opts.fallbackId
        ? reparentSourcesByCategoryDexie(categoryId, opts.fallbackId)
        : Promise.resolve(0),
    deleteMindMapsByCategoryDexie(categoryId),
    deleteMnemonicsByCategoryDexie(categoryId),
    deleteArticlesBySubjectDexie(categoryId),
  ]);
  result.cardsAffected = cardsN;
  result.sourcesAffected = sourcesN;
  result.mindMaps = mindMapsN;
  result.mnemonics = mnemonicsN;
  result.articles = articlesN;

  // 3. KV (settings + planner scrub) — no FK, must be explicit.
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

  // 4. Notify bridges — TanStack invalidates all affected query keys.
  notifyCardsChanged();
  notifyKnowledgeBaseChanged();
  notifyMnemonics();
  if (result.mindMaps > 0) invalidateMindMapsCache();
  if (result.settings > 0) clearSubjectSettings(categoryId);
  invalidateExaminerProfile(categoryId);
  backlinkIndex.clear(categoryId);
  invalidateSourcesCache();

  return result;
}
