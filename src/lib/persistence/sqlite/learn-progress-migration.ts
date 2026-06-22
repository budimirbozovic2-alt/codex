/**
 * One-shot migration: explode `sr-learn-progress` KV blob into `learn_progress` rows.
 */
import type { SqlExecutor } from "./executor";
import type { LearnCardProgress } from "@/lib/types/logs";
import { kvGet } from "./kv";
import { logger } from "@/lib/logger";

const FLAG_KEY = "learn-progress-relational-v1";
const LEGACY_KV_KEY = "sr-learn-progress";

export async function migrateLearnProgressToRelational(
  exec: SqlExecutor,
): Promise<{ migrated: number }> {
  const flagRows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  if (flagRows[0]?.value === "1") return { migrated: 0 };

  const existing = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM learn_progress",
  );
  if (Number(existing[0]?.n ?? 0) > 0) {
    await exec.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
    return { migrated: 0 };
  }

  const blob =
    (await kvGet<Record<string, LearnCardProgress>>(exec, LEGACY_KV_KEY)) ?? {};
  const entries = Object.entries(blob);
  if (entries.length === 0) {
    await exec.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
    return { migrated: 0 };
  }

  const now = Date.now();
  await exec.transaction(async (tx) => {
    for (const [cardId, progress] of entries) {
      await tx.run(
        "INSERT OR REPLACE INTO learn_progress (card_id, payload, updatedAt) VALUES (?, ?, ?)",
        [cardId, JSON.stringify(progress), now],
      );
    }
    await tx.run("DELETE FROM kv WHERE key = ?", [LEGACY_KV_KEY]);
    await tx.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
      FLAG_KEY,
      "1",
    ]);
  });

  logger.info(`[migration] learn_progress: ${entries.length} card(s)`);
  return { migrated: entries.length };
}
