/**
 * Major System repository — PR-9 A1c-2. SQLite-only.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

export interface MajorSystemPeg {
  id: number;
  peg: string;
}

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron() && import.meta.env.PROD) { notifyExecutorNull("majorSystem", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[major-system-repo] sqlite executor unavailable", err);
    notifyExecutorNull("majorSystem", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[major-system-repo] ${label} — no executor (dev shell)`);
  return null;
}

const INSERT_SQL = "INSERT OR REPLACE INTO majorSystem (id, peg) VALUES (?, ?)";

export async function listAllPegs(): Promise<MajorSystemPeg[]> {
  const exec = await requireExecutor("listAllPegs");
  if (!exec) return [];
  const rows = await exec.all<{ id: number; peg: string }>(
    "SELECT id, peg FROM majorSystem ORDER BY id",
  );
  return rows.map((r) => ({ id: Number(r.id), peg: String(r.peg) }));
}

export async function bulkPutPegs(pegs: MajorSystemPeg[]): Promise<void> {
  if (pegs.length === 0) return;
  const exec = await requireExecutor("bulkPutPegs");
  if (!exec) return;
  await exec.transaction(async (tx) => {
    await tx.runMany(INSERT_SQL, pegs.map((p) => [p.id, p.peg]));
  });

}
