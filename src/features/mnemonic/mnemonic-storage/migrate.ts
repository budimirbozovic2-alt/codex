// One-shot migration: localStorage → SQLite (all-or-nothing).
// Marks completion via the `mnemonics-migrated-v10` flag.
//
// A1c-4 F6: writes go straight to SQLite via the queries layer — the legacy
// Dexie hop is gone. Three independent bulk writes guarded by an outer
// try/catch: if any one bulk fails, the flag is not set and the migration
// retries on next boot (idempotent via INSERT OR REPLACE).

import { logger } from "@/lib/logger";
import {
  bulkPutMnemonics,
  bulkPutPegs,
  addTestLogEntry,
} from "@/lib/db/queries";
import type { MnemonicCard } from "./types";
import { MAJOR_SYSTEM_KEY, MNEMONIC_CARDS_KEY, MNEMONIC_TEST_LOG_KEY } from "./constants";

interface LegacyTestLogEntry {
  cardId: string;
  timestamp: number;
  success: boolean;
}

export async function migrateMnemonicsFromLocalStorageToIDB(): Promise<number> {
  const MIGRATED_FLAG = "mnemonics-migrated-v10";
  if (localStorage.getItem(MIGRATED_FLAG) === "true") return 0;

  try {
    const rawCards = localStorage.getItem(MNEMONIC_CARDS_KEY);
    const rawMajor = localStorage.getItem(MAJOR_SYSTEM_KEY);
    const rawLog = localStorage.getItem(MNEMONIC_TEST_LOG_KEY);

    const cards = rawCards ? JSON.parse(rawCards) : [];
    const majorSystem = rawMajor ? JSON.parse(rawMajor) : {};
    const testLog: LegacyTestLogEntry[] = rawLog ? JSON.parse(rawLog) : [];

    if (cards.length === 0 && Object.keys(majorSystem).length === 0 && testLog.length === 0) {
      localStorage.setItem(MIGRATED_FLAG, "true");
      return 0;
    }

    // Transform cards
    const transformedCards: MnemonicCard[] = cards.map((c: Partial<MnemonicCard> & { category?: string; mnemonicVideo?: unknown }) => ({
      ...(c as MnemonicCard),
      categoryId: c.categoryId || c.category || "",
      subcategoryId: c.subcategoryId || crypto.randomUUID(),
      hookType: c.hookType || "ostalo",
      hookMode: c.hookMode || (c.mnemonicVideo ? "video" : "acronym"),
      tags: c.tags || [],
    }));

    // Transform major system records to match schema: { id: number; peg: string }
    const majorRecords = Object.entries(majorSystem).map(([key, value]) => ({
      id: parseInt(key, 10),
      peg: value as string,
    }));

    // SQLite-primary writes. Each bulk helper opens its own ACID transaction.
    if (transformedCards.length > 0) await bulkPutMnemonics(transformedCards);
    if (majorRecords.length > 0)    await bulkPutPegs(majorRecords);
    for (const entry of testLog) await addTestLogEntry(entry);

    // FLAG only after all bulk writes succeed.
    localStorage.setItem(MIGRATED_FLAG, "true");

    // Bezbjedno brisanje starih podataka
    localStorage.removeItem(MNEMONIC_CARDS_KEY);
    localStorage.removeItem(MAJOR_SYSTEM_KEY);
    localStorage.removeItem(MNEMONIC_TEST_LOG_KEY);

    if (import.meta.env.DEV) logger.log(`[Migracija] Uspješno prebačeno ${transformedCards.length} mnemonika u SQLite.`);
    return transformedCards.length;

  } catch (error) {
    logger.error("[Migracija KRITIČNO] Bulk write u SQLite propao; flag nije postavljen — migracija se ponavlja sledeći boot. LocalStorage ostaje netaknut.", error);
    return 0;
  }
}
