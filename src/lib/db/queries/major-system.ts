/**
 * Major System repository — PR-9 A1c-2. SQLite-only.
 */
import { requireSqlExecutor } from "./_shared/require-sql-executor";

export interface MajorSystemPeg {
  id: number;
  peg: string;
}

const INSERT_SQL = 
  "INSERT OR REPLACE INTO majorSystem (id, peg) VALUES (?, ?)";

// ─── Read API ───────────────────────────────────────────────────

export async function listAllPegs(): 
  Promise<MajorSystemPeg[]> {
  const exec = await requireSqlExecutor("majorSystem:listAllPegs");
  const rows = await exec.all<{ id: number; peg: string }>(
    "SELECT id, peg FROM majorSystem ORDER BY id",
  );
  return rows.map((r) => ({ 
    id: Number(r.id), 
    peg: String(r.peg) 
  }));
}

// ─── Write API ──────────────────────────────────────────────────

export async function bulkPutPegs(
  pegs: MajorSystemPeg[]
): Promise<void> {
  if (pegs.length === 0) return;
  const exec = await requireSqlExecutor("majorSystem:bulkPutPegs");
  await exec.transaction(async (tx) => {
    await tx.runMany(
      INSERT_SQL, 
      pegs.map((p) => [p.id, p.peg])
    );
  });
}
