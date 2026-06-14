/**
 * One-shot migration: backfill `card_sections_index` from embedded section
 * JSON in existing `cards.payload` rows.
 */
import type { SqlExecutor } from "./executor";
import { decodeCard } from "./row-codecs";
import { syncCardSectionsIndexMany } from "./card-sections-index";

const FLAG_KEY = "card-sections-index-v1";
const BATCH_SIZE = 200;

export async function migrateCardSectionsIndex(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  const flagRows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  if (flagRows[0]?.value === "1") return { migrated: 0 };

  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM cards",
  );
  if (rows.length === 0) {
    await exec.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
    return { migrated: 0 };
  }

  let migrated = 0;
  await exec.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const cards = batch
        .map((row) => {
          try {
            return decodeCard(row);
          } catch {
            return null;
          }
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);
      if (cards.length > 0) {
        await syncCardSectionsIndexMany(tx, cards);
        migrated += cards.length;
      }
    }
    await tx.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
  });

  return { migrated };
}
