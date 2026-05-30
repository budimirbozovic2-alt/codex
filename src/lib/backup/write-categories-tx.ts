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
import type { TaxonomyRemap } from "@/lib/backup/taxonomy-merge";
import {
  CATEGORY_INSERT_SQL,
  bindCategory,
} from "@/lib/backup/sqlite-row-bindings";

export async function writeCategoriesTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  freshCategories: CategoryRecord[],
  taxonomy: TaxonomyRemap | null = null,
): Promise<CategoryRecord[]> {
  // Working set the caller can use for downstream post-tx mirroring.
  // Starts as a snapshot of `freshCategories` and is mutated to match the
  // final on-disk state.
  let working: CategoryRecord[] = [...freshCategories];

  if (parsed.categories.length > 0) {
    if (isCategoryRecordArray(parsed.categories)) {
      if (strategy === "overwrite") {
        // Overwrite: parsed wins wholesale. Pre-tx remaps are empty in this
        // mode (see buildTaxonomyRemap), so satellite FKs already point to
        // parsed UUIDs.
        await tx.run("DELETE FROM categories");
        await tx.runMany(
          CATEGORY_INSERT_SQL,
          parsed.categories.map((cat) => bindCategory(cat)),
        );

        working = [...parsed.categories];
        // FK sweep: only after categories are finalized.
        const validIds = new Set(parsed.categories.map((c) => c.id));
        pruneOrphans(parsed, validIds);
      } else if (taxonomy) {
        // Merge mode — adopt novel sub/chapters and persist the resulting
        // category records. categoriesToWrite is the diff slice; mergedCategories
        // is the final snapshot returned to AppContext.
        if (taxonomy.categoriesToWrite.length > 0) {
          await tx.runMany(
            CATEGORY_INSERT_SQL,
            taxonomy.categoriesToWrite.map((cat) => bindCategory(cat)),
          );
        }
        working = [...taxonomy.mergedCategories];
      } else {
        // Defensive fallback — should not happen because the orchestrator
        // always builds a TaxonomyRemap when parsed.categories is modern.
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
    } else {
      // Legacy `string[]` format — synthesize CategoryRecord[] from names.
      const legacyNames = parsed.categories;
      if (strategy === "overwrite") {
        const allRecs: CategoryRecord[] = legacyNames.map((name, i) => ({
          id: crypto.randomUUID(), name, sortOrder: i, subcategories: [],
        }));
        await tx.run("DELETE FROM categories");
        await tx.runMany(CATEGORY_INSERT_SQL, allRecs.map((cat) => bindCategory(cat)));

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
        await tx.runMany(CATEGORY_INSERT_SQL, newRecs.map((cat) => bindCategory(cat)));

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
    await tx.runMany(CATEGORY_INSERT_SQL, updated.map((cat) => bindCategory(cat)));
    working = updated;
  }


  return working;
}
