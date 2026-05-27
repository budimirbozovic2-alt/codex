// Mnemonic cards repository: IDB CRUD + local change-notifier
// (post Task-B replacement for the legacy MNEMONICS_UPDATED bus event).

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MnemonicCard } from "./types";

export async function loadMnemonicCards(): Promise<MnemonicCard[]> {
  try {
    return await db.mnemonics.toArray();
  } catch (err) {
    logger.error("[mnemonic-storage] loadMnemonicCards failed", err);
    return [];
  }
}

/**
 * B2: Indexed scoped loader. Uses the `categoryId` index added in v10
 * (previously dead weight — every consumer was doing global `toArray()` +
 * JS-side filter). Subject-scoped views should use this to avoid pulling
 * N×subjects worth of mnemonic cards into memory only to discard most.
 */
export async function loadMnemonicCardsByCategory(categoryId: string): Promise<MnemonicCard[]> {
  try {
    return await db.mnemonics.where("categoryId").equals(categoryId).toArray();
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
function notifyMnemonics(): void {
  for (const cb of _mnemonicListeners) {
    try { cb(); } catch { /* ignore listener errors */ }
  }
}

export async function saveMnemonicCards(cards: MnemonicCard[]): Promise<void> {
  try {
    await db.mnemonics.bulkPut(cards);
    notifyMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] saveMnemonicCards failed", err);
  }
}

export async function deleteMnemonicCard(id: string): Promise<void> {
  try {
    await db.mnemonics.delete(id);
    notifyMnemonics();
  } catch (err) {
    logger.error("[mnemonic-storage] deleteMnemonicCard failed", err);
  }
}
