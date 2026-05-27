// Mnemonic cards repository: SQLite-primary CRUD + local change-notifier.
//
// P1.3 — DB I/O delegated to `@/lib/db/queries/mnemonics` (SQLite-primary,
// Dexie mirror). This module retains the listener-based change notifier
// (`subscribeMnemonics`) consumed across the mnemonic feature.

import { logger } from "@/lib/logger";
import {
  listAllMnemonics,
  listMnemonicsByCategory,
  bulkPutMnemonics,
  deleteMnemonic as repoDeleteMnemonic,
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
 * B2: Indexed scoped loader. Now routes through the SQLite-primary repo
 * (which falls back to the Dexie `categoryId` index in the web preview).
 */
export async function loadMnemonicCardsByCategory(categoryId: string): Promise<MnemonicCard[]> {
  try {
    return await listMnemonicsByCategory(categoryId);
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicCardsByCategory failed", err);
    return [];
  }
}

// ─── Local change-notifier (post Task-B replacement for MNEMONICS_UPDATED) ──
const _mnemonicListeners = new Set<() => void>();
export function subscribeMnemonics(cb: () => void): () => void {
  _mnemonicListeners.add(cb);
  return () => { _mnemonicListeners.delete(cb); };
}
/**
 * Fire-and-forget notify for mnemonic-domain mutations.
 * Exported so sibling repos (major-system, test-log) can signal through the
 * single mnemonic emitter consumed by the TanStack bridge.
 */
export function notifyMnemonics(): void {
  for (const cb of _mnemonicListeners) {
    try { cb(); } catch { /* ignore listener errors */ }
  }
}

export async function saveMnemonicCards(cards: MnemonicCard[]): Promise<void> {
  try {
    await bulkPutMnemonics(cards);
    notifyMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] saveMnemonicCards failed", err);
  }
}

export async function deleteMnemonicCard(id: string): Promise<void> {
  try {
    await repoDeleteMnemonic(id);
    notifyMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] deleteMnemonicCard failed", err);
  }
}
