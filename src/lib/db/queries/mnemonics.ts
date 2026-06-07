/**
 * Mnemonics repository — PR-9 A1c-2. SQLite-only.
 */
import type { 
  SqlExecutor 
} from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";
import type { 
  MnemonicCard 
} from "@/features/mnemonic/mnemonic-storage";
import { 
  notifyExecutorNull 
} from "./_shared/executor-telemetry";

// ─── Executor accessor ──────────────────────────────────────────

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import(
      "@/lib/electron-integration"
    );
    if (!isElectron() && import.meta.env.PROD) { 
      notifyExecutorNull("mnemonics", "non-electron"); 
      return null; 
    }
    
    const { getOpfsSqliteExecutor } = await import(
      "@/lib/persistence/sqlite/client"
    );
    
    // PR-H7 ŠTIT: Čekamo bazu do 3 sekunde (30 * 100ms) ako kasni
    let exec = await getOpfsSqliteExecutor();
    let retries = 30;
    
    while (!exec && retries > 0) {
      await new Promise((res) => setTimeout(res, 100));
      exec = await getOpfsSqliteExecutor();
      retries--;
    }
    
    return exec;
  } catch (err) {
    logger.warn(
      "[mnemonics-repo] sqlite executor unavailable", 
      err
    );
    notifyExecutorNull("mnemonics", "error");
    return null;
  }
}

async function requireExecutor(
  label: string
): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import(
    "@/lib/electron-integration"
  );
  assertDesktop();
  logger.warn(
    `[mnemonics-repo] ${label} — no executor (dev shell)`
  );
  return null;
}

// ─── Codec ──────────────────────────────────────────────────────

function decodeMnemonic(row: { 
  payload: string 
}): MnemonicCard | null {
  try { 
    return JSON.parse(row.payload) as MnemonicCard; 
  } catch (err) {
    logger.warn("[mnemonics-repo] decode failed", err);
    return null;
  }
}

const INSERT_SQL = `
  INSERT OR REPLACE INTO mnemonics (
    id, categoryId, subcategoryId, 
    mnemonicStatus, hookType, createdAt, payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

function bindMnemonic(
  m: MnemonicCard
): (string | number | null)[] {
  return [
    m.id,
    m.categoryId,
    m.subcategoryId ?? null,
    m.mnemonicStatus ?? null,
    m.hookType ?? null,
    m.createdAt,
    JSON.stringify(m),
  ];
}

// ─── Read API ───────────────────────────────────────────────────

export async function getMnemonic(
  id: string
): Promise<MnemonicCard | undefined> {
  const exec = await requireExecutor("getMnemonic");
  if (!exec) return undefined;
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonics WHERE id = ? LIMIT 1", 
    [id],
  );
  if (rows.length === 0) return undefined;
  return decodeMnemonic(rows[0]) ?? undefined;
}

export async function listAllMnemonics(): 
  Promise<MnemonicCard[]> {
  const exec = await requireExecutor("listAllMnemonics");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonics"
  );
  return rows
    .map(decodeMnemonic)
    .filter((d): d is MnemonicCard => d !== null);
}

export async function listMnemonicsByCategory(
  categoryId: string
): Promise<MnemonicCard[]> {
  const exec = await requireExecutor("listMnemonicsByCategory");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonics WHERE categoryId = ?", 
    [categoryId],
  );
  return rows
    .map(decodeMnemonic)
    .filter((d): d is MnemonicCard => d !== null);
}

// ─── Write API ──────────────────────────────────────────────────

export async function putMnemonic(
  card: MnemonicCard
): Promise<void> {
  const exec = await requireExecutor("putMnemonic");
  if (!exec) return;
  await exec.run(INSERT_SQL, bindMnemonic(card));
}

export async function bulkPutMnemonics(
  cards: MnemonicCard[]
): Promise<void> {
  if (cards.length === 0) return;
  const exec = await requireExecutor("bulkPutMnemonics");
  if (!exec) return;
  await exec.transaction(async (tx) => {
    await tx.runMany(
      INSERT_SQL, 
      cards.map((c) => bindMnemonic(c))
    );
  });
}

export async function deleteMnemonic(id: string): Promise<void> {
  const exec = await requireExecutor("deleteMnemonic");
  if (!exec) return;
  await exec.run(
    "DELETE FROM mnemonics WHERE id = ?", 
    [id]
  );
}