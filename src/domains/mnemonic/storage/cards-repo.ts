import { logger } from "@/lib/logger";
import { invalidateMnemonicsQueries } from "@/lib/query/domain-invalidation";
import {
  listAllMnemonics,
  listMnemonicsByCategory,
  bulkPutMnemonics,
} from "@/lib/db/queries/mnemonics";
import type { MnemonicCard } from "../types";

export async function loadMnemonicCards(): Promise<MnemonicCard[]> {
  try {
    return await listAllMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicCards failed", err);
    return [];
  }
}

export async function loadMnemonicCardsByCategory(categoryId: string): Promise<MnemonicCard[]> {
  try {
    return await listMnemonicsByCategory(categoryId);
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicCardsByCategory failed", err);
    return [];
  }
}

export function notifyMnemonics(): void {
  invalidateMnemonicsQueries();
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
