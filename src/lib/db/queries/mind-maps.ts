/**
 * Mind maps repository — PR-9 A1c-2.
 *
 * SQLite-only read/write for the `mindMaps` table.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { MindMapDoc } from "@/lib/db-types";
import { logger } from "@/lib/logger";
import { notifyExecutorNull } from "./_shared/executor-telemetry";
import { withSqlTiming } from "./_shared/sql-timing";

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("mindMaps", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[mindmaps-repo] sqlite executor unavailable", err);
    notifyExecutorNull("mindMaps", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[mindmaps-repo] ${label} — no executor (dev shell)`);
  return null;
}

function decodeMindMap(row: { payload: string }): MindMapDoc | null {
  try { return JSON.parse(row.payload) as MindMapDoc; }
  catch (err) {
    logger.warn("[mindmaps-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO mindMaps (id, categoryId, title, updatedAt, payload)
  VALUES (?, ?, ?, ?, ?)
`;

export async function getMindMap(id: string): Promise<MindMapDoc | undefined> {
  const exec = await requireExecutor("getMindMap");
  if (!exec) return undefined;
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mindMaps WHERE id = ? LIMIT 1", [id],
  );
  if (rows.length === 0) return undefined;
  return decodeMindMap(rows[0]) ?? undefined;
}

export async function listAllMindMaps(): Promise<MindMapDoc[]> {
  return withSqlTiming("listAllMindMaps", async () => {
    const exec = await requireExecutor("listAllMindMaps");
    if (!exec) return [];
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM mindMaps ORDER BY updatedAt DESC",
    );
    return rows.map(decodeMindMap).filter((d): d is MindMapDoc => d !== null);
  });
}

export async function countAllMindMaps(): Promise<number> {
  const exec = await requireExecutor("countAllMindMaps");
  if (!exec) return 0;
  const rows = await exec.all<{ n: number }>("SELECT COUNT(*) AS n FROM mindMaps");
  return Number(rows[0]?.n ?? 0);
}

export async function listMindMapsByCategory(categoryId: string): Promise<MindMapDoc[]> {
  const exec = await requireExecutor("listMindMapsByCategory");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mindMaps WHERE categoryId = ? ORDER BY updatedAt DESC",
    [categoryId],
  );
  return rows.map(decodeMindMap).filter((d): d is MindMapDoc => d !== null);
}

export async function putMindMap(doc: MindMapDoc): Promise<void> {
  const exec = await requireExecutor("putMindMap");
  if (!exec) return;
  if (!doc.categoryId) {
    logger.warn("[mindmaps-repo] put skipped — missing categoryId", { id: doc.id });
    return;
  }
  await exec.run(INSERT_SQL, [
    doc.id,
    doc.categoryId,
    doc.title,
    doc.updatedAt,
    JSON.stringify(doc),
  ]);
}

export async function deleteMindMap(id: string): Promise<void> {
  const exec = await requireExecutor("deleteMindMap");
  if (!exec) return;
  await exec.run("DELETE FROM mindMaps WHERE id = ?", [id]);
}
