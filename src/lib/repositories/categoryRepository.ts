// ─────────────────────────────────────────────────────────────────────────────
// Category Repository — primary writer for taxonomy records.
//
// Persistence runs through `queries/categories.ts` (single SQL transaction
// per commit). TanStack `['categories','all']` is the RAM read cache.
// ─────────────────────────────────────────────────────────────────────────────
import type { CategoryRecord } from "@/lib/db-types";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { createKeyedMutex } from "@/lib/concurrency";
import { wrapWrite, type WriteResult } from "@/lib/persistence/write-result";
import { requireSqlExecutor } from "@/lib/db/queries/_shared/require-sql-executor";
import {
  replaceAllCategories,
} from "@/lib/db/queries";
import { invalidateCategoriesCache } from "@/lib/query/categories-invalidation";
import { queryClient } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import {
  getCategoriesFromQueryCache,
  seedCategoriesQueryCache,
} from "@/lib/query/cache-coordinator";

function getCategorySnapshot(): CategoryRecord[] {
  return [...getCategoriesFromQueryCache()];
}

/**
 * Full replace — bootstrap, restore. Pushes into TanStack only.
 * Does NOT persist to SQLite (caller already wrote).
 */
export function replaceAll(records: CategoryRecord[]): void {
  seedCategoriesQueryCache(records, undefined, records.length);
}

const _saveMutex = createKeyedMutex();

export interface CategoryCommitOptions {
  skipNotify?: boolean;
}

/**
 * Optimistic commit: TanStack first, then SQLite; rollback on failure.
 */
export async function commit(
  updater: (prev: CategoryRecord[]) => CategoryRecord[],
  label: string,
  opts?: CategoryCommitOptions,
): Promise<CategoryRecord[]> {
  return _saveMutex.runExclusive(null, async () => {
    const preOptimistic = getCategorySnapshot();
    const optimistic = updater(preOptimistic);
    queryClient.setQueryData(queryKeys.categories.all(), optimistic);
    queryClient.setQueryData(
      queryKeys.categories.countAll(),
      optimistic.length,
    );
    try {
      await replaceAllCategories(optimistic);
      if (!opts?.skipNotify) {
        invalidateCategoriesCache();
      }
    } catch (e) {
      logger.error(`[${label}] SQLite persist failed, rolling back`, e);
      queryClient.setQueryData(queryKeys.categories.all(), preOptimistic);
      queryClient.setQueryData(
        queryKeys.categories.countAll(),
        preOptimistic.length,
      );
      toast.error("Greška", { description: "Promjena nije sačuvana." });
      throw e instanceof Error ? e : new Error(String(e));
    }
    return optimistic;
  }, `category:${label}`);
}

export interface DeleteCategoryOpts {
  purgeCards: boolean;
  fallbackId: string;
}

export function deleteAsync(
  id: string,
  opts: DeleteCategoryOpts,
): Promise<WriteResult<void>> {
  return wrapWrite(async () => {
    if (!id) return;
    const exec = await requireSqlExecutor("category-repo:delete");

    await exec.transaction(async (tx) => {
      if (opts.purgeCards) {
        await tx.run("DELETE FROM cards WHERE categoryId = ?", [id]);
        await tx.run("DELETE FROM sources WHERE categoryId = ?", [id]);
      } else if (opts.fallbackId) {
        const now = Date.now();
        await tx.run(
          `UPDATE cards
              SET categoryId    = ?,
                  subcategoryId = NULL,
                  chapterId     = NULL,
                  updatedAt     = ?,
                  payload       = json_set(
                                    json_remove(payload, '$.subcategoryId', '$.chapterId'),
                                    '$.categoryId', ?,
                                    '$.updatedAt',  ?
                                  )
            WHERE categoryId = ?`,
          [opts.fallbackId, now, opts.fallbackId, now, id],
        );
        await tx.run(
          `UPDATE sources
              SET categoryId = ?,
                  payload    = json_set(payload, '$.categoryId', ?)
            WHERE categoryId = ?`,
          [opts.fallbackId, opts.fallbackId, id],
        );
      }
      await tx.run("DELETE FROM categories WHERE id = ?", [id]);
    });
  });
}

export const categoryRepository = {
  snapshot: getCategorySnapshot,
  commit,
  replaceAll,
  deleteAsync,
};
