/**
 * Categories-table write helper (sections 4a + 4b of the import flow).
 *
 * Runs inside the orchestrator's rw transaction. Handles both the modern
 * `CategoryRecord[]` format and the legacy `string[]` names format, plus
 * the legacy `parsed.subcategories` flat map. On overwrite, prunes orphan
 * satellite rows whose categoryId no longer exists (delegated to
 * `pruneOrphans`).
 */
import { db, type CategoryRecord, type SubcategoryNode } from "@/lib/db";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { ImportStrategy } from "@/lib/backup/import-types";
import { isCategoryRecordArray, pruneOrphans } from "@/lib/backup/import-remap";

export async function writeCategoriesTx(
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  freshCategories: CategoryRecord[],
): Promise<void> {
  // 4a. Categories
  if (parsed.categories.length > 0) {
    if (isCategoryRecordArray(parsed.categories)) {
      if (strategy === "overwrite") {
        // Pre-tx remap already aligned satellite FKs to existing IDs;
        // any backup categories whose name already exists were also
        // remapped, so a clear+bulkPut here is safe.
        await db.categories.clear();
        await db.categories.bulkPut(parsed.categories);
        // FK sweep: only after categories are finalized.
        const validIds = new Set(parsed.categories.map((c) => c.id));
        pruneOrphans(parsed, validIds);
      } else {
        // Non-overwrite: bulkPut only categories that didn't get remapped.
        const existingByName = new Map<string, string>();
        for (const c of freshCategories) existingByName.set(c.name.toLowerCase(), c.id);
        const toInsert = parsed.categories.filter(
          (cr) => !existingByName.has(cr.name.toLowerCase()),
        );
        if (toInsert.length > 0) await db.categories.bulkPut(toInsert);
      }
    } else {
      // Legacy `string[]` format — create CategoryRecord[] from names.
      const legacyNames = parsed.categories;
      if (strategy === "overwrite") {
        const allRecs: CategoryRecord[] = legacyNames.map((name, i) => ({
          id: crypto.randomUUID(), name, sortOrder: i, subcategories: [],
        }));
        await db.categories.clear();
        await db.categories.bulkPut(allRecs);
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
        if (newRecs.length > 0) await db.categories.bulkPut(newRecs);
      }
    }
  }

  // 4b. Legacy `subcategories` map (only if legacy names format).
  const isNewCatFormat = parsed.categories.length === 0 || isCategoryRecordArray(parsed.categories);
  if (parsed.subcategories && typeof parsed.subcategories === "object" && !isNewCatFormat) {
    const recs = await db.categories.toArray();
    const subData = parsed.subcategories as Record<string, string[]>;
    const updated = recs.map((r) => {
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
    await db.categories.bulkPut(updated);
  }
}
