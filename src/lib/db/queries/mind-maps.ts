/**
 * Mind maps repository — PR-9 A1c-2.
 * SQLite-only read/write for the `mindMaps` table.
 */
import type { MindMapDoc } from "@/lib/db-types";
import { logger } from "@/lib/logger";
import { withSqlTiming } from "./_shared/sql-timing";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

function decodeMindMap(row: { 
  payload: string 
}): MindMapDoc | null {
  try { 
    return JSON.parse(row.payload) as MindMapDoc; 
  } catch (err) {
    logger.warn("[mindmaps-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO mindMaps (
    id, categoryId, title, updatedAt, payload
  ) VALUES (?, ?, ?, ?, ?)
`;

// ─── Read API ───────────────────────────────────────────────────

export async function getMindMap(
  id: string
): Promise<MindMapDoc | undefined> {
  const exec = await requireSqlExecutor("mindMaps:getMindMap");
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mindMaps WHERE id = ? LIMIT 1", 
    [id],
  );
  if (rows.length === 0) return undefined;
  return decodeMindMap(rows[0]) ?? undefined;
}

export async function listAllMindMaps(): Promise<MindMapDoc[]> {
  return withSqlTiming("listAllMindMaps", async () => {
    const exec = await requireSqlExecutor("mindMaps:listAllMindMaps");
    const rows = await exec.all<{ payload: string }>(
      "SELECT payload FROM mindMaps ORDER BY updatedAt DESC",
    );
    return rows
      .map(decodeMindMap)
      .filter((d): d is MindMapDoc => d !== null);
  });
}

export async function countAllMindMaps(): Promise<number> {
  const exec = await requireSqlExecutor("mindMaps:countAllMindMaps");
  const rows = await exec.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM mindMaps"
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listMindMapsByCategory(
  categoryId: string
): Promise<MindMapDoc[]> {
  const exec = await requireSqlExecutor("mindMaps:listMindMapsByCategory");
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mindMaps WHERE categoryId = ? " +
    "ORDER BY updatedAt DESC",
    [categoryId],
  );
  return rows
    .map(decodeMindMap)
    .filter((d): d is MindMapDoc => d !== null);
}

// ─── Write API ──────────────────────────────────────────────────

export async function putMindMap(doc: MindMapDoc): Promise<void> {
  const exec = await requireSqlExecutor("mindMaps:putMindMap");
  
  // AUDIT FIX: Obrisana destruktivna restrikcija za categoryId.
  // Podaci se sada bezbjedno upisuju u nullable kolonu.
  await exec.run(INSERT_SQL, [
    doc.id,
    doc.categoryId ?? null,
    doc.title,
    doc.updatedAt,
    JSON.stringify(doc),
  ]);
}

export async function deleteMindMap(id: string): Promise<void> {
  const exec = await requireSqlExecutor("mindMaps:deleteMindMap");
  await exec.run("DELETE FROM mindMaps WHERE id = ?", [id]);
}
