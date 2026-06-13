// ─────────────────────────────────────────────────────────────────────────────
// Category Repository — primary writer for `categoryRecords`.
//
// Persistence runs through `queries/categories.ts` (single SQL transaction
// per commit). Zustand `categoryStore` remains the RAM SSOT all readers
// subscribe to via `useSyncExternalStore`; external callers that bypass this
// repository (e.g. backup-restore) still push directly into the store via
// `setCategoryStoreRecords`.
//
// `deleteAsync` runs a single SQLite transaction that re-parents (or purges)
// cards + sources, then deletes the category row. FK CASCADE on the schema
// then wipes mindMaps / mnemonics / knowledgeBaseArticles in the same step.
// Cross-domain cache cleanup lives in `categoryDeletionOrchestrator`.
// ─────────────────────────────────────────────────────────────────────────────
import type { CategoryRecord } from "@/lib/db-types";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { createKeyedMutex } from "@/lib/concurrency";
import {
  getCategoryStoreRecords,
  setCategoryStoreRecords,
} from "@/store/useCategoryStore";
import { wrapWrite, type WriteResult } from "@/lib/persistence/write-result";
import { requireSqlExecutor } from "@/lib/db/queries/_shared/require-sql-executor";
import { replaceAllCategories } from "@/lib/db/queries";

// ─── Read primitives ─────────────────────────────────────────────────────
function getCategorySnapshot(): CategoryRecord[] {
  return getCategoryStoreRecords();
}

// ─── Write primitives ────────────────────────────────────────────────────

/**
 * Full replace — bootstrap, restore. Pushes into the SSOT synchronously.
 * Does NOT persist to SQLite on its own (the upstream caller — e.g.
 * `applyImportAtomically`, `loadInitialData` — has already done that).
 */
export function replaceAll(records: CategoryRecord[]): void {
  setCategoryStoreRecords(records);
}

const _saveMutex = createKeyedMutex();

/**
 * Optimistic commit: pushes the optimistic value into the SSOT store, then
 * persists to SQLite — both **inside** a serialised mutex so concurrent
 * commits cannot race each other's rollback target.
 */
export async function commit(
  updater: (prev: CategoryRecord[]) => CategoryRecord[],
  label: string,
): Promise<void> {
  return _saveMutex.runExclusive(null, async () => {
    const preOptimistic = getCategoryStoreRecords();
    const optimistic = updater(preOptimistic);
    setCategoryStoreRecords(optimistic);
    try {
      await replaceAllCategories(optimistic);
    } catch (e) {
      logger.error(`[${label}] SQLite persist failed, rolling back`, e);
      setCategoryStoreRecords(preOptimistic);
      toast.error("Greška", { description: "Promjena nije sačuvana." });
      throw e instanceof Error ? e : new Error(String(e));
    }
  }, `category:${label}`);
}


// ─── A2 — SQLite-primary delete with FK CASCADE ──────────────────────────

export interface DeleteCategoryOpts {
  /** When true: drop cards + sources for this category. When false: re-parent. */
  purgeCards: boolean;
  /** Re-parent target when `purgeCards === false`. Empty string skips re-parent. */
  fallbackId: string;
}

/**
 * Delete a category and cascade its children in one SQLite transaction.
 * FK CASCADE on the schema wipes mindMaps / mnemonics / knowledgeBaseArticles
 * automatically; cards + sources are handled explicitly so the `purgeCards`
 * vs. re-parent semantics survive (FK can't conditionally null-out).
 */
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
