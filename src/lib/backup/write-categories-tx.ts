/**
 * Categories-table write helper.
 *
 * Runs inside the orchestrator's `exec.transaction`. Categories are the
 * aggregate root: they must land **before** any satellite write so FK refs stay valid.
 */
import { type CategoryRecord } from "@/lib/db-types";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { ImportStrategy } from "@/lib/backup/import-types";
import {
  CATEGORY_INSERT_SQL,
  bindCategory,
} from "@/lib/backup/sqlite-row-bindings";
import {
  replaceCategoryTaxonomy,
} from "@/lib/persistence/sqlite/category-codecs";
import { mergeCategoriesByStrategy } from "@/lib/backup/merge-categories";

export async function writeCategoriesTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  freshCategories: CategoryRecord[],
): Promise<CategoryRecord[]> {
  if (parsed.categories.length === 0) return [...freshCategories];

  const { toUpsert, working } = mergeCategoriesByStrategy(
    parsed.categories,
    freshCategories,
    strategy,
  );

  if (strategy === "overwrite") {
    await tx.run("DELETE FROM chapters");
    await tx.run("DELETE FROM subcategories");
    await tx.run("DELETE FROM categories");
  }

  if (toUpsert.length > 0) {
    await tx.runMany(
      CATEGORY_INSERT_SQL,
      toUpsert.map((cat) => bindCategory(cat)),
    );
    for (const cat of toUpsert) {
      await replaceCategoryTaxonomy(tx, cat.id, cat.subcategories ?? []);
    }
  }

  return working;
}
