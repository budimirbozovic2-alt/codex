/**
 * Learn-mode per-card progress — SQLite-primary (`learn_progress` table).
 */
import type { LearnCardProgress } from "@/lib/types/logs";
import { logger } from "@/lib/logger";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

const INSERT_SQL = `
  INSERT OR REPLACE INTO learn_progress (card_id, payload, updatedAt)
  VALUES (?, ?, ?)
`;

export async function loadAllLearnProgress(): Promise<
  Record<string, LearnCardProgress>
> {
  const exec = await requireSqlExecutor("learn-progress:loadAll");
  try {
    const rows = await exec.all<{ card_id: string; payload: string }>(
      "SELECT card_id, payload FROM learn_progress",
    );
    const out: Record<string, LearnCardProgress> = {};
    for (const row of rows) {
      try {
        out[row.card_id] = JSON.parse(row.payload) as LearnCardProgress;
      } catch (err) {
        logger.warn("[learn-progress] decode failed", { cardId: row.card_id, err });
      }
    }
    return out;
  } catch (err) {
    logger.warn("[learn-progress] load failed", err);
    return {};
  }
}

export async function replaceAllLearnProgress(
  data: Record<string, LearnCardProgress>,
): Promise<void> {
  const exec = await requireSqlExecutor("learn-progress:replaceAll");
  const now = Date.now();
  const entries = Object.entries(data);
  await exec.transaction(async (tx) => {
    await tx.run("DELETE FROM learn_progress");
    if (entries.length === 0) return;
    await tx.runMany(
      INSERT_SQL,
      entries.map(([cardId, progress]) => [
        cardId,
        JSON.stringify(progress),
        now,
      ]),
    );
  });
}

export async function clearLearnProgress(): Promise<void> {
  const exec = await requireSqlExecutor("learn-progress:clear");
  await exec.run("DELETE FROM learn_progress");
}
