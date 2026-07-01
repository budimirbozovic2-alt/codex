/**

 * Categories repository — PR-9 A1c-4 F1.

 * SQLite-only read/write for categories.

 *

 * PR-10: subcategories + chapters are relational tables; `categories.payload`

 * stores only `examinerProfile` (JSON).

 */

import type { CategoryRecord } from "@/lib/db-types";

import { CATEGORY_INSERT_SQL, bindCategory } from "@/lib/backup/sqlite-row-bindings";

import {

  loadAllCategoryRows,

  persistCategoryTaxonomy,

  replaceCategoryTaxonomy,

} from "@/lib/persistence/sqlite/category-codecs";

import { requireSqlExecutor } from "./_shared/require-sql-executor";
import type { CategoriesChangedScope } from "@/lib/query/cache-scope-types";
import { invalidateCategoriesCache } from "@/lib/query/categories-invalidation";



// ─── Read API ───────────────────────────────────────────────────



/** All categories ordered by sortOrder, then name. */

export async function listAllCategories(): Promise<CategoryRecord[]> {

  const exec = await requireSqlExecutor("categories:listAll");

  return loadAllCategoryRows(exec);

}



export async function getCategory(id: string): Promise<CategoryRecord | null> {

  const all = await listAllCategories();

  return all.find((c) => c.id === id) ?? null;

}



export async function countCategories(): Promise<number> {

  const exec = await requireSqlExecutor("categories:count");

  const rows = await exec.all<{ n: number }>("SELECT COUNT(*) AS n FROM categories");

  return Number(rows[0]?.n ?? 0);

}



// ─── Write API ──────────────────────────────────────────────────



/**

 * Replace all categories atomically (bootstrap, restore, commit).

 * FK CASCADE wipes subcategories + chapters when categories are deleted.

 */

export async function replaceAllCategories(

  records: readonly CategoryRecord[],

): Promise<void> {

  const exec = await requireSqlExecutor("categories:replaceAll");

  await exec.transaction(async (tx) => {

    await tx.run("DELETE FROM chapters");

    await tx.run("DELETE FROM subcategories");

    await tx.run("DELETE FROM categories");

    if (records.length > 0) {

      await tx.runMany(

        CATEGORY_INSERT_SQL,

        records.map((c) => bindCategory(c)),

      );

      await persistCategoryTaxonomy(tx, records);

    }

  });

}



/** Upsert a single category + replace its taxonomy subtree. */

export async function putCategory(c: CategoryRecord): Promise<void> {

  const exec = await requireSqlExecutor("categories:put");

  await exec.transaction(async (tx) => {

    await tx.run(CATEGORY_INSERT_SQL, bindCategory(c));

    await replaceCategoryTaxonomy(tx, c.id, c.subcategories ?? []);

  });

}



/** Upsert N categories in one transaction. */

export async function bulkPutCategories(

  records: readonly CategoryRecord[],

): Promise<void> {

  if (records.length === 0) return;

  const exec = await requireSqlExecutor("categories:bulkPut");

  await exec.transaction(async (tx) => {

    await tx.runMany(CATEGORY_INSERT_SQL, records.map((c) => bindCategory(c)));

    for (const c of records) {

      await replaceCategoryTaxonomy(tx, c.id, c.subcategories ?? []);

    }

  });

}



/** Wipe every category row and taxonomy. */

export async function clearCategories(): Promise<void> {

  const exec = await requireSqlExecutor("categories:clear");

  await exec.transaction(async (tx) => {

    await tx.run("DELETE FROM chapters");

    await tx.run("DELETE FROM subcategories");

    await tx.run("DELETE FROM categories");

  });

}

// ── Cache invalidation ───────────────────────────────────────────

export type CategoriesScope = CategoriesChangedScope;

export function notifyCategoriesChanged(
  _scope: CategoriesScope = { kind: "all" },
): void {
  invalidateCategoriesCache();
}


