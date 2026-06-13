/**
 * Mnemonics repository — PR-9 A1c-2. SQLite-only.
 */
import { logger } from "@/lib/logger";
import type { 
  MnemonicCard 
} from "@/features/mnemonic/mnemonic-storage";
import {
  normalizeMnemonicCardForWrite,
  normalizeMnemonicCardOnRead,
} from "@/features/mnemonic/mnemonic-storage/mnemonic-section-codec";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

// ─── Codec ──────────────────────────────────────────────────────

function decodeMnemonic(row: { 
  payload: string 
}): MnemonicCard | null {
  try { 
    const parsed = JSON.parse(row.payload) as MnemonicCard;
    return normalizeMnemonicCardOnRead(parsed);
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
  const normalized = normalizeMnemonicCardForWrite(m);
  return [
    normalized.id,
    normalized.categoryId,
    normalized.subcategoryId ?? null,
    normalized.mnemonicStatus ?? null,
    normalized.hookType ?? null,
    normalized.createdAt,
    JSON.stringify(normalized),
  ];
}

// ─── Read API ───────────────────────────────────────────────────

export async function getMnemonic(
  id: string
): Promise<MnemonicCard | undefined> {
  const exec = await requireSqlExecutor("mnemonics:getMnemonic");
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonics WHERE id = ? LIMIT 1", 
    [id],
  );
  if (rows.length === 0) return undefined;
  return decodeMnemonic(rows[0]) ?? undefined;
}

export async function listAllMnemonics(): 
  Promise<MnemonicCard[]> {
  const exec = await requireSqlExecutor("mnemonics:listAllMnemonics");
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
  const exec = await requireSqlExecutor("mnemonics:listMnemonicsByCategory");
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
  const exec = await requireSqlExecutor("mnemonics:putMnemonic");
  await exec.run(INSERT_SQL, bindMnemonic(card));
}

export async function bulkPutMnemonics(
  cards: MnemonicCard[]
): Promise<void> {
  if (cards.length === 0) return;
  const exec = await requireSqlExecutor("mnemonics:bulkPutMnemonics");
  await exec.transaction(async (tx) => {
    await tx.runMany(
      INSERT_SQL, 
      cards.map((c) => bindMnemonic(c))
    );
  });
}

export async function deleteMnemonic(id: string): Promise<void> {
  const exec = await requireSqlExecutor("mnemonics:deleteMnemonic");
  await exec.run(
    "DELETE FROM mnemonics WHERE id = ?", 
    [id]
  );
}
