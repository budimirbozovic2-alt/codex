/**
 * One-shot migration: explode `subcategories` / `chapters` from the legacy
 * JSON blob in `categories.payload` into relational tables.
 */
import type { SqlExecutor } from "./executor";
import {
  decodeCategoryPayload,
  decodeLegacySubcategories,
  encodeCategoryPayload,
  persistCategoryTaxonomy,
} from "./category-codecs";

const FLAG_KEY = "taxonomy-relational-v1";

export async function migrateCategoryTaxonomyToRelational(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  const flagRows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  if (flagRows[0]?.value === "1") return { migrated: 0 };

  const catRows = await exec.all<{
    id: string;
    name: string;
    sortOrder: number;
    color: string | null;
    payload: string;
  }>("SELECT id, name, sortOrder, color, payload FROM categories");

  let migrated = 0;
  await exec.transaction(async (tx) => {
    for (const row of catRows) {
      const countRows = await tx.all<{ n: number }>(
        "SELECT COUNT(*) AS n FROM subcategories WHERE categoryId = ?",
        [row.id],
      );
      const alreadyRelational = Number(countRows[0]?.n ?? 0) > 0;

      const legacySubs = decodeLegacySubcategories(row.payload);
      const extras = decodeCategoryPayload(row.payload);

      if (!alreadyRelational && legacySubs.length > 0) {
        await persistCategoryTaxonomy(tx, [
          {
            id: row.id,
            name: row.name,
            sortOrder: row.sortOrder,
            color: row.color ?? undefined,
            subcategories: legacySubs,
          },
        ]);
        migrated++;
      }

      const slim = encodeCategoryPayload({
        examinerProfile: extras.examinerProfile,
      });
      if (slim !== row.payload) {
        await tx.run("UPDATE categories SET payload = ? WHERE id = ?", [
          slim,
          row.id,
        ]);
      }
    }

    await tx.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
  });

  return { migrated };
}
