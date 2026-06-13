/**
 * Category deletion orchestrator — coordinates SQLite delete with
 * cross-domain cache / KV cleanup. Keeps `categoryRepository` free of
 * domain coupling.
 */
import { logger } from "@/lib/logger";
import {
  categoryRepository,
  type DeleteCategoryOpts,
} from "@/lib/repositories/categoryRepository";
import {
  deleteSetting,
  getSetting,
  notifyCardsChanged,
  notifyKnowledgeBaseChanged,
} from "@/lib/db/queries";
import { invalidateMindMapsCache } from "@/domains/mindmaps/mindmap-storage";
import { invalidateSourcesCache } from "@/domains/sources/sources-storage";
import { clearSubjectSettings } from "@/domains/subjects/subject-settings";
import { invalidateExaminerProfile } from "@/lib/examiner-profile-cache";
import { backlinkIndex } from "@/lib/backlink-index";
import { scrubCategoryFromPlannerConfig } from "@/domains/planner";
import { notifyMnemonics } from "@/domains/mnemonic";

const SUBJECT_SETTINGS_PREFIX = "subject_settings:";

export interface CategoryDeletionResult {
  articles: number;
  mindMaps: number;
  mnemonics: number;
  settings: number;
  plannerScrubbed: boolean;
  cardsAffected: number;
  sourcesAffected: number;
}

export type { DeleteCategoryOpts };

/**
 * SQLite cascade delete + non-relational cache/KV cleanup across domains.
 * Call after optimistically removing the row from the in-memory store.
 */
export async function deleteCategoryWithDependencies(
  categoryId: string,
  opts: DeleteCategoryOpts,
): Promise<CategoryDeletionResult> {
  const result: CategoryDeletionResult = {
    articles: 0,
    mindMaps: 0,
    mnemonics: 0,
    settings: 0,
    plannerScrubbed: false,
    cardsAffected: 0,
    sourcesAffected: 0,
  };
  if (!categoryId) return result;

  const sqlResult = await categoryRepository.deleteAsync(categoryId, opts);
  if (sqlResult.ok === false) {
    logger.error("[category-deletion] sqlite cascade failed", sqlResult.error);
    throw new Error(sqlResult.error.message);
  }

  const settingsKey = SUBJECT_SETTINGS_PREFIX + categoryId;
  const existed = await getSetting<unknown>(settingsKey);
  if (existed !== undefined) {
    await deleteSetting(settingsKey);
    result.settings = 1;
  }

  result.plannerScrubbed = scrubCategoryFromPlannerConfig(categoryId);

  notifyCardsChanged({ kind: "category", categoryId });
  notifyKnowledgeBaseChanged();
  notifyMnemonics();
  if (result.mindMaps > 0) invalidateMindMapsCache();
  if (result.settings > 0) clearSubjectSettings(categoryId);
  invalidateExaminerProfile(categoryId);
  backlinkIndex.clear(categoryId);
  invalidateSourcesCache();

  return result;
}
