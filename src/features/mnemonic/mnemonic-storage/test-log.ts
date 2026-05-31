// Isolated mnemonic test log I/O.
// PR-9 A1b P1.6: delegates to SQLite-primary repo (Dexie mirror during soak).

import { logger } from "@/lib/logger";
import {
  listAllTestLogEntries,
  addTestLogEntry,
} from "@/lib/db/queries/mnemonic-test-log";
import { notifyMnemonics } from "./cards-repo";
import type { MnemonicTestLogEntry } from "./types";

export async function loadMnemonicTestLog(): Promise<MnemonicTestLogEntry[]> {
  try {
    return await listAllTestLogEntries();
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicTestLog failed", err);
    return [];
  }
}

export async function addMnemonicTestEntry(entry: MnemonicTestLogEntry): Promise<void> {
  try {
    await addTestLogEntry(entry);
    notifyMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] addMnemonicTestEntry failed", err);
    throw err;
  }
}
