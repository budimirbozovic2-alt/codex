/**
 * Mnemonic test log repository — PR-9 A1c-2. SQLite-only.
 */
import { logger } from "@/lib/logger";
import type { MnemonicTestLogEntry } from "@/domains/mnemonic";
import { requireSqlExecutor } from "./_shared/require-sql-executor";

const INSERT_SQL = `
  INSERT INTO mnemonicTestLog (
    cardId, timestamp, success, payload
  ) VALUES (?, ?, ?, ?)
`;

function decode(row: { 
  payload: string 
}): MnemonicTestLogEntry | null {
  try { 
    return JSON.parse(row.payload) as MnemonicTestLogEntry; 
  } catch (err) {
    logger.warn("[mnemonic-test-log-repo] decode failed", err);
    return null;
  }
}

// ─── Read API ───────────────────────────────────────────────────

export async function listAllTestLogEntries(): 
  Promise<MnemonicTestLogEntry[]> {
  const exec = await requireSqlExecutor("mnemonicTestLog:listAllTestLogEntries");
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM mnemonicTestLog 
     ORDER BY timestamp ASC, id ASC`,
  );
  return rows
    .map(decode)
    .filter((d): d is MnemonicTestLogEntry => d !== null);
}

export async function listTestLogEntriesByCard(
  cardId: string
): Promise<MnemonicTestLogEntry[]> {
  const exec = await requireSqlExecutor("mnemonicTestLog:listTestLogEntriesByCard");
  const rows = await exec.all<{ payload: string }>(
    `SELECT payload FROM mnemonicTestLog 
     WHERE cardId = ? 
     ORDER BY timestamp ASC, id ASC`,
    [cardId],
  );
  return rows
    .map(decode)
    .filter((d): d is MnemonicTestLogEntry => d !== null);
}

// ─── Write API ──────────────────────────────────────────────────

export async function addTestLogEntry(
  entry: MnemonicTestLogEntry
): Promise<void> {
  const exec = await requireSqlExecutor("mnemonicTestLog:addTestLogEntry");
  await exec.run(INSERT_SQL, [
    entry.cardId,
    entry.timestamp,
    entry.success ? 1 : 0,
    JSON.stringify(entry),
  ]);
}
