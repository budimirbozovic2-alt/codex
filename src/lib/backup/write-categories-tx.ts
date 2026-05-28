/**
 * Categories-table write helper — PR-9 A1c-4.
 *
 * Runs inside the orchestrator's `exec.transaction`. Categories are the
 * aggregate root: they must land **before** any satellite (sources, cards,
 * mindMaps, mnemonics, KB articles) so that FK references stay valid.
 *
 * Modern `CategoryRecord[]` and the legacy `string[]` names format are both
 * supported. Legacy `parsed.subcategories` flat map is folded into the
 * appropriate `CategoryRecord.subcategories[]` and re-inserted.
 */
import { type CategoryRecord, type SubcategoryNode } from "@/lib/db-types";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { ImportStrategy } from "@/lib/backup/import-types";
import {
  isCategoryRecordArray,
  pruneOrphans,
} from "@/lib/backup/import-remap";
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
  // Working set the caller can use for downstream post-tx mirroring.
  // Starts as a snapshot of `freshCategories` and is mutated to match the
  // final on-disk state.
  let working: CategoryRecord[] = [...freshCategories];

  if (parsed.categories.length > 0) {
    if (isCategoryRecordArray(parsed.categories)) {
      if (strategy === "overwrite") {
        // Pre-tx remap already aligned satellite FKs to existing IDs;
        // any backup categories whose name already exists were remapped,
        // so a wipe + bulk insert here is safe.
        await tx.run("DELETE FROM categories");
        await tx.runMany(
          CATEGORY_INSERT_SQL,
          parsed.categories.map((cat) => bindCategory(cat)),
        );

        working = [...parsed.categories];
        // FK sweep: only after categories are finalized.
        const validIds = new Set(parsed.categories.map((c) => c.id));
        pruneOrphans(parsed, validIds);
      } else {
        // Non-overwrite: insert only categories that didn't get remapped.
        const existingByName = new Map<string, string>();
        for (const c of freshCategories) existingByName.set(c.name.toLowerCase(), c.id);
        const toInsert = parsed.categories.filter(
          (cr) => !existingByName.has(cr.name.toLowerCase()),
        );
        for (const cat of toInsert) {
          await tx.run(CATEGORY_INSERT_SQL, bindCategory(cat));
        }
        working = [...freshCategories, ...toInsert];
      }
    } else {
      // Legacy `string[]` format — synthesize CategoryRecord[] from names.
      const legacyNames = parsed.categories;
      if (strategy === "overwrite") {
        const allRecs: CategoryRecord[] = legacyNames.map((name, i) => ({
          id: crypto.randomUUID(), name, sortOrder: i, subcategories: [],
        }));
        await tx.run("DELETE FROM categories");
        for (const cat of allRecs) {
          await tx.run(CATEGORY_INSERT_SQL, bindCategory(cat));
        }
        working = allRecs;
      } else {
        const existingNames = new Set(freshCategories.map((r) => r.name));
        const newRecs: CategoryRecord[] = [];
        for (const name of legacyNames) {
          if (!existingNames.has(name)) {
            newRecs.push({
              id: crypto.randomUUID(),
              name,
              sortOrder: freshCategories.length + newRecs.length,
              subcategories: [],
            });
          }
        }
        for (const cat of newRecs) {
          await tx.run(CATEGORY_INSERT_SQL, bindCategory(cat));
        }
        working = [...freshCategories, ...newRecs];
      }
    }
  }

  // Legacy `subcategories` map (only if legacy names format).
  const isNewCatFormat =
    parsed.categories.length === 0 || isCategoryRecordArray(parsed.categories);
  if (parsed.subcategories && typeof parsed.subcategories === "object" && !isNewCatFormat) {
    const subData = parsed.subcategories as Record<string, string[]>;
    const updated = working.map((r) => {
      const subs = subData[r.id] || subData[r.name] || [];
      if (subs.length === 0) return r;
      const existingNames = new Set(r.subcategories.map((n) => n.name));
      const newNodes: SubcategoryNode[] = subs
        .filter((s) => !existingNames.has(s))
        .map((name, i) => ({
          id: crypto.randomUUID(),
          name,
          chapters: [],
          sortOrder: r.subcategories.length + i,
        }));
      return { ...r, subcategories: [...r.subcategories, ...newNodes] };
    });
    for (const cat of updated) {
      await tx.run(CATEGORY_INSERT_SQL, bindCategory(cat));
    }
    working = updated;
  }

  return working;
}
