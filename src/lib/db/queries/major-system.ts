/**
 * Major System repository — PR-9 A1b P1.6.
 *
 * SQLite-primary read/write for the `majorSystem` table (numeric id → peg
 * term). Mirrors the pattern used by sources/mind-maps/mnemonics:
 *   1. Try SQLite when running in Electron.
 *   2. Mirror writes into Dexie for one soak release.
 *   3. Fall back to Dexie-only in non-Electron contexts (dev preview).
 *
 * The Major System is small (~100 rows) and read in full by the workshop UI,
 * so the API is intentionally coarse: `listAllPegs` + `bulkPutPegs`.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

export interface MajorSystemPeg {
  id: number;
  peg: string;
}

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("majorSystem", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[major-system-repo] sqlite executor unavailable, using Dexie fallback", err);
    notifyExecutorNull("majorSystem", "error");
    return null;
  }
}

const INSERT_SQL =
  "INSERT OR REPLACE INTO majorSystem (id, peg) VALUES (?, ?)";

export async function listAllPegs(): Promise<MajorSystemPeg[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ id: number; peg: string }>(
        "SELECT id, peg FROM majorSystem ORDER BY id",
      );
      if (rows.length > 0) {
        return rows.map((r) => ({ id: Number(r.id), peg: String(r.peg) }));
      }
    } catch (err) {
      logger.warn("[major-system-repo] sqlite listAll failed", err);
    }
  }
  try {
    return await db.majorSystem.toArray();
  } catch (err) {
    logger.warn("[major-system-repo] dexie listAll failed", err);
    return [];
  }
}

export async function bulkPutPegs(pegs: MajorSystemPeg[]): Promise<void> {
  if (pegs.length === 0) return;
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await exec.transaction(async (tx) => {
        for (const p of pegs) {
          await tx.run(INSERT_SQL, [p.id, p.peg]);
        }
      });
    } catch (err) {
      logger.warn("[major-system-repo] sqlite bulkPut failed", err);
      throw err;
    }
  }
  try {
    await db.majorSystem.bulkPut(pegs);
  } catch (err) {
    logger.warn("[major-system-repo] dexie mirror bulkPut failed", err);
    throw err;
  }
}
