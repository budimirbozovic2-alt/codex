/**
 * Backfill normalized `card_sections` from card JSON payload (TD-ARCH-8).
 */
import type { SqlExecutor } from "./executor";
import { decodeCard } from "./row-codecs";
import { syncCardSectionsMany } from "./card-sections";

const FLAG_KEY = "card-sections-normalized-v1";
const BATCH_SIZE = 200;

export async function migrateCardSectionsNormalized(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  const flagRows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  if (flagRows[0]?.value === "1") return { migrated: 0 };

  const tableRows = await exec.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
    ["card_sections"],
  );
  if (Number(tableRows[0]?.n ?? 0) === 0) return { migrated: 0 };

  const rows = await exec.all<{ payload: string }>("SELECT payload FROM cards");
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
        await syncCardSectionsMany(tx, cards);
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
