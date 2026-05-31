// ─────────────────────────────────────────────────────────────────────────────
// Category Repository — primary writer for `categoryRecords`.
//
// A1c-4 F1: SQLite-primary. The Dexie `categories` mirror is gone — durable
// persistence runs through `queries/categories.ts` (single SQL transaction
// per commit). Zustand `categoryStore` remains the RAM SSOT all readers
// subscribe to via `useSyncExternalStore`; external callers that bypass this
// repository (e.g. backup-restore) still push directly into the store via
// `setCategoryStoreRecords`.
//
// A2 — `deleteAsync` runs a single SQLite transaction that re-parents (or
// purges) cards + sources, then deletes the category row. FK CASCADE on the
// schema then wipes mindMaps / mnemonics / knowledgeBaseArticles in the same
// atomic step.
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
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import {
  listAllCategories,
  replaceAllCategories,
} from "@/lib/db/queries";

// ─── Read primitives ─────────────────────────────────────────────────────
export function getCategorySnapshot(): CategoryRecord[] {
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

// Mutex for serialising SQLite writes — prevents concurrent overwrites when
// two optimistic updates race (e.g. fast double-click on reorder). SQLite's
// own transaction would still serialise at the FS layer, but read-modify-
// write here needs the mutex to avoid stale-snapshot overwrites.
const _saveMutex = createKeyedMutex();

/**
 * Optimistic commit: applies the updater to the current RAM snapshot, pushes
 * the optimistic value into the SSOT store, then persists to SQLite inside a
 * serialised mutex.
 *
 * On persist failure we ALWAYS roll back to the pre-commit snapshot —
 * never to a fresh `listAllCategories()`, because when the SQLite executor
 * is unavailable that helper returns `[]` and would wipe every category
 * (this is the root cause of "adding a second category deletes the first"
 * in the Vite preview shell).
 */
export async function commit(
  updater: (prev: CategoryRecord[]) => CategoryRecord[],
  label: string,
): Promise<void> {
  const snapshot = getCategoryStoreRecords();
  const optimistic = updater(snapshot);
  setCategoryStoreRecords(optimistic);

  return _saveMutex.runExclusive(null, async () => {
    try {
      // Persist the exact RAM snapshot the user is looking at. SQLite ACID
      // makes the read-modify-write dance redundant; serialising via the
      // mutex prevents two concurrent commits from racing.
      await replaceAllCategories(optimistic);
    } catch (e) {
      logger.error(`[${label}] SQLite persist failed, rolling back`, e);
      setCategoryStoreRecords(snapshot);
      toast.error("Greška", { description: "Promjena nije sačuvana." });
    }
  }, `category:${label}`);
}

// ─── A2 — SQLite-primary delete with FK CASCADE ──────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron() && import.meta.env.PROD) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[category-repo] sqlite executor unavailable", err);
    return null;
  }
}

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
 *
 * Returns ok even if the SQLite executor isn't available (Vite dev shell).
 */
export function deleteAsync(
  id: string,
  opts: DeleteCategoryOpts,
): Promise<WriteResult<void>> {
  return wrapWrite(async () => {
    if (!id) return;
    const exec = await tryGetExecutor();
    if (!exec) return;

    await exec.transaction(async (tx) => {
      if (opts.purgeCards) {
        await tx.run("DELETE FROM cards WHERE categoryId = ?", [id]);
        await tx.run("DELETE FROM sources WHERE categoryId = ?", [id]);
      } else if (opts.fallbackId) {
        const now = Date.now();
        // A2 — keep JSON payload in sync with indexed columns via JSON1.
        // Cards: new categoryId, drop subcategory/chapter refs.
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
        // Sources: mirror new categoryId into payload JSON too.
        await tx.run(
          `UPDATE sources
              SET categoryId = ?,
                  payload    = json_set(payload, '$.categoryId', ?)
            WHERE categoryId = ?`,
          [opts.fallbackId, opts.fallbackId, id],
        );
      }
      // Final blow — FK CASCADE wipes mindMaps + mnemonics + KB articles.
      await tx.run("DELETE FROM categories WHERE id = ?", [id]);
    });
  });
}


export const categoryRepository = {
  // reads
  snapshot: getCategorySnapshot,
  // writes
  commit,
  replaceAll,
  deleteAsync,
};
