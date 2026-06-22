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
} from "@/lib/db/queries";
import { scrubCategoryFromPlannerConfig } from "@/domains/planner";
import { runBulkWriteSession } from "@/lib/query/all-caches-coordinator";

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
  const empty: CategoryDeletionResult = {
    articles: 0,
    mindMaps: 0,
    mnemonics: 0,
    settings: 0,
    plannerScrubbed: false,
    cardsAffected: 0,
    sourcesAffected: 0,
  };
  if (!categoryId) return empty;

  return runBulkWriteSession(
    { cards: true, categories: true },
    async () => {
      const result = { ...empty };

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

      return result;
    },
    (result) => ({
      satellites: "category-delete",
      categoryDelete: {
        categoryId,
        clearSubjectSettings: result.settings > 0,
      },
    }),
  );
}
