// One-shot migration: localStorage → IndexedDB (all-or-nothing).
// Marks completion via the `mnemonics-migrated-v10` flag.

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { MnemonicCard } from "./types";
import { MAJOR_SYSTEM_KEY, MNEMONIC_CARDS_KEY, MNEMONIC_TEST_LOG_KEY } from "./constants";

export async function migrateMnemonicsFromLocalStorageToIDB(): Promise<number> {
  const MIGRATED_FLAG = "mnemonics-migrated-v10";
  if (localStorage.getItem(MIGRATED_FLAG) === "true") return 0;

  try {
    const rawCards = localStorage.getItem(MNEMONIC_CARDS_KEY);
    const rawMajor = localStorage.getItem(MAJOR_SYSTEM_KEY);
    const rawLog = localStorage.getItem(MNEMONIC_TEST_LOG_KEY);

    const cards = rawCards ? JSON.parse(rawCards) : [];
    const majorSystem = rawMajor ? JSON.parse(rawMajor) : {};
    const testLog = rawLog ? JSON.parse(rawLog) : [];

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

    // ALL-OR-NOTHING TRANSAKCIJA
    await db.transaction('rw', [db.mnemonics, db.majorSystem, db.mnemonicTestLog], async () => {
      if (transformedCards.length > 0) {
        await db.mnemonics.bulkPut(transformedCards);
      }
      if (majorRecords.length > 0) {
        await db.majorSystem.bulkPut(majorRecords);
      }
      if (testLog.length > 0) {
        await db.mnemonicTestLog.bulkAdd(testLog);
      }
    });

    // ZAVRŠNI COMMIT SIGNAL (Tek kada je IDB transakcija 100% uspješna)
    localStorage.setItem(MIGRATED_FLAG, "true");

    // Bezbjedno brisanje starih podataka
    localStorage.removeItem(MNEMONIC_CARDS_KEY);
    localStorage.removeItem(MAJOR_SYSTEM_KEY);
    localStorage.removeItem(MNEMONIC_TEST_LOG_KEY);

    if (import.meta.env.DEV) logger.log(`[Migracija] Uspješno prebačeno ${transformedCards.length} mnemonika u IDB.`);
    return transformedCards.length;

  } catch (error) {
    logger.error("[Migracija KRITIČNO] Transakcija propala, podaci u IDB poništeni. LocalStorage ostaje netaknut.", error);
    return 0;
  }
}
