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

export async function writeCategoriesTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  freshCategories: CategoryRecord[],
): Promise<CategoryRecord[]> {
  let working: CategoryRecord[] = [...freshCategories];

  if (parsed.categories.length === 0) return working;

  if (strategy === "overwrite") {
    await tx.run("DELETE FROM categories");
    await tx.runMany(
      CATEGORY_INSERT_SQL,
      parsed.categories.map((cat) => bindCategory(cat)),
    );
    working = [...parsed.categories];
  } else {
    const existingByName = new Map<string, string>();
    for (const c of freshCategories) existingByName.set(c.name.toLowerCase(), c.id);
    const toInsert = parsed.categories.filter(
      (cr) => !existingByName.has(cr.name.toLowerCase()),
    );
    await tx.runMany(
      CATEGORY_INSERT_SQL,
      toInsert.map((cat) => bindCategory(cat)),
    );
    working = [...freshCategories, ...toInsert];
  }

  return working;
}
