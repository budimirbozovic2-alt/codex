/**
 * One-shot migration: backfill `cards.mastery_score` from embedded section JSON.
 */
import type { SqlExecutor } from "./executor";
import { decodeCard } from "./row-codecs";
import { computeCardMasteryScore } from "./card-mastery-score";

const FLAG_KEY = "card-mastery-score-v1";
const BATCH_SIZE = 200;

export async function migrateCardMasteryScores(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  const cols = await exec.all<{ name: string }>("PRAGMA table_info(cards)");
  if (!cols.some((c) => c.name === "mastery_score")) {
    await exec.exec(
      "ALTER TABLE cards ADD COLUMN mastery_score REAL NOT NULL DEFAULT 0;",
    );
  }

  const flagRows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  if (flagRows[0]?.value === "1") return { migrated: 0 };

  const rows = await exec.all<{ id: string; payload: string }>(
    "SELECT id, payload FROM cards",
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
      for (const row of batch) {
        try {
          const card = decodeCard(row);
          const score = computeCardMasteryScore(card);
          await tx.run("UPDATE cards SET mastery_score = ? WHERE id = ?", [
            score,
            card.id,
          ]);
          migrated++;
        } catch {
          /* skip corrupt rows */
        }
      }
    }
    await tx.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
  });

  return { migrated };
}
