// Isolated mnemonic test log I/O.

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MnemonicTestLogEntry } from "./types";

export async function loadMnemonicTestLog(): Promise<MnemonicTestLogEntry[]> {
  try {
    return await db.mnemonicTestLog.toArray();
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicTestLog failed", err);
    return [];
  }
}

export async function addMnemonicTestEntry(entry: MnemonicTestLogEntry): Promise<void> {
  try {
    await db.mnemonicTestLog.add(entry);
  } catch (err) {
    logger.error("[mnemonic-storage] addMnemonicTestEntry failed", err);
  }
}
