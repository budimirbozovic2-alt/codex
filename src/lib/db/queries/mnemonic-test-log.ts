/**
 * Mnemonic test log repository — PR-9 A1b P1.6.
 *
 * Append-only event log for mnemonic workshop test outcomes. The SQLite
 * table uses AUTOINCREMENT to preserve the Dexie `++id` semantics — callers
 * never supply an id. Reads return entries sorted by timestamp ascending so
 * downstream consumers can compute rolling stats without re-sorting.
 *
 * Pattern mirrors the rest of the queries module: SQLite-primary on
 * Electron, Dexie mirror for one soak release, Dexie fallback in dev
 * preview where the OPFS executor isn't available.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MnemonicTestLogEntry } from "@/features/mnemonic/mnemonic-storage";

async function tryGetExecutor(): Promise<SqlExecutor | null> {
  try {
    const { isElectron } = await import("@/lib/electron-integration");
    if (!isElectron()) return null;
    const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
    return await getOpfsSqliteExecutor();
  } catch (err) {
    logger.warn("[mnemonic-test-log-repo] sqlite executor unavailable, using Dexie fallback", err);
    return null;
  }
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
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mnemonicTestLog ORDER BY timestamp ASC, id ASC",
      );
      if (rows.length > 0) {
        return rows.map(decode).filter((d): d is MnemonicTestLogEntry => d !== null);
      }
    } catch (err) {
      logger.warn("[mnemonic-test-log-repo] sqlite listAll failed", err);
    }
  }
  try {
    return await db.mnemonicTestLog.toArray();
  } catch (err) {
    logger.warn("[mnemonic-test-log-repo] dexie listAll failed", err);
    return [];
  }
}

export async function listTestLogEntriesByCard(cardId: string): Promise<MnemonicTestLogEntry[]> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      const rows = await exec.all<{ payload: string }>(
        "SELECT payload FROM mnemonicTestLog WHERE cardId = ? ORDER BY timestamp ASC, id ASC",
        [cardId],
      );
      return rows.map(decode).filter((d): d is MnemonicTestLogEntry => d !== null);
    } catch (err) {
      logger.warn("[mnemonic-test-log-repo] sqlite listByCard failed", { cardId, err });
    }
  }
  try {
    return await db.mnemonicTestLog.where("cardId").equals(cardId).toArray();
  } catch (err) {
    logger.warn("[mnemonic-test-log-repo] dexie listByCard failed", { cardId, err });
    return [];
  }
}

export async function addTestLogEntry(entry: MnemonicTestLogEntry): Promise<void> {
  const exec = await tryGetExecutor();
  if (exec) {
    try {
      await exec.run(INSERT_SQL, [
        entry.cardId,
        entry.timestamp,
        entry.success ? 1 : 0,
        JSON.stringify(entry),
      ]);
    } catch (err) {
      logger.warn("[mnemonic-test-log-repo] sqlite add failed", err);
      throw err;
    }
  }
  try {
    await db.mnemonicTestLog.add(entry);
  } catch (err) {
    logger.warn("[mnemonic-test-log-repo] dexie mirror add failed", err);
    throw err;
  }
}
