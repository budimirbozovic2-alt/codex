/**
 * Mnemonic test log repository — PR-9 A1c-2. SQLite-only.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { logger } from "@/lib/logger";
import type { MnemonicTestLogEntry } from "@/features/mnemonic/mnemonic-storage";
import { notifyExecutorNull } from "./_shared/executor-telemetry";

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) { notifyExecutorNull("mnemonicTestLog", "non-electron"); return null; }
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[mnemonic-test-log-repo] sqlite executor unavailable", err);
    notifyExecutorNull("mnemonicTestLog", "error");
    return null;
  }
}

async function requireExecutor(label: string): Promise<SqlExecutor | null> {
  const exec = await tryGetExecutor();
  if (exec) return exec;
  const { assertDesktop } = await import("@/lib/electron-integration");
  assertDesktop();
  logger.warn(`[mnemonic-test-log-repo] ${label} — no executor (dev shell)`);
  return null;
}

const INSERT_SQL = `
  INSERT INTO mnemonicTestLog (cardId, timestamp, success, payload)
  VALUES (?, ?, ?, ?)
`;

function decode(row: { payload: string }): MnemonicTestLogEntry | null {
  try { return JSON.parse(row.payload) as MnemonicTestLogEntry; }
  catch (err) {
    logger.warn("[mnemonic-test-log-repo] decode failed", err);
    return null;
  }
}

export async function listAllTestLogEntries(): Promise<MnemonicTestLogEntry[]> {
  const exec = await requireExecutor("listAllTestLogEntries");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonicTestLog ORDER BY timestamp ASC, id ASC",
  );
  return rows.map(decode).filter((d): d is MnemonicTestLogEntry => d !== null);
}

export async function listTestLogEntriesByCard(cardId: string): Promise<MnemonicTestLogEntry[]> {
  const exec = await requireExecutor("listTestLogEntriesByCard");
  if (!exec) return [];
  const rows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonicTestLog WHERE cardId = ? ORDER BY timestamp ASC, id ASC",
    [cardId],
  );
  return rows.map(decode).filter((d): d is MnemonicTestLogEntry => d !== null);
}

export async function addTestLogEntry(entry: MnemonicTestLogEntry): Promise<void> {
  const exec = await requireExecutor("addTestLogEntry");
  if (!exec) return;
  await exec.run(INSERT_SQL, [
    entry.cardId,
    entry.timestamp,
    entry.success ? 1 : 0,
    JSON.stringify(entry),
  ]);
}
