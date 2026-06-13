// Mnemonic cards repository: SQLite-primary CRUD + domain event notifier.

import { logger } from "@/lib/logger";
import { emitDomainChanged } from "@/lib/event-bus";
import {
  listAllMnemonics,
  listMnemonicsByCategory,
  bulkPutMnemonics,
} from "@/lib/db/queries/mnemonics";
import type { MnemonicCard } from "./types";

export async function loadMnemonicCards(): Promise<MnemonicCard[]> {
  try {
    return await listAllMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicCards failed", err);
    return [];
  }
}

/**
 * B2: Indexed scoped loader via SQLite-primary repo.
 */
export async function loadMnemonicCardsByCategory(categoryId: string): Promise<MnemonicCard[]> {
  try {
    return await listMnemonicsByCategory(categoryId);
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicCardsByCategory failed", err);
    return [];
  }
}

/**
 * Fire-and-forget notify for mnemonic-domain mutations.
 * Exported so sibling repos (major-system, test-log) can signal through the
 * unified event bus consumed by the TanStack bridge.
 */
export function notifyMnemonics(): void {
  emitDomainChanged({ domain: "mnemonics" });
}

export async function saveMnemonicCards(cards: MnemonicCard[]): Promise<void> {
  try {
    await bulkPutMnemonics(cards);
    notifyMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] saveMnemonicCards failed", err);
    throw err;
  }
}
