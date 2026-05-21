import { migrateFromLocalStorage } from "@/lib/db";
import { checkInterruptedFlush } from "@/lib/persist-queue";
import { markBootStep } from "@/lib/boot-trace";
import { splashProgress } from "./splash";
import { withTimeout } from "./withTimeout";

import { logger } from "@/lib/logger";
export async function runMigrations(): Promise<void> {
  markBootStep("cards:migration-start");
  splashProgress(10, "Migracija podataka…");
  if (import.meta.env.DEV) logger.log("[boot:diag] step 2: migrateFromLocalStorage");
  await withTimeout(migrateFromLocalStorage(), 3000, "migration", undefined);

  // Mnemonics migration (localStorage -> IDB)
  const { migrateMnemonicsFromLocalStorageToIDB } = await import("@/features/mnemonic");
  await withTimeout(migrateMnemonicsFromLocalStorageToIDB(), 3000, "mnemonic migration", undefined);

  // Heal stale subcategoryId/chapterId references on cards (one-shot, flagged)
  try {
    const { healCardTaxonomy } = await import("@/lib/migrations/heal-card-taxonomy");
    const report = await withTimeout(healCardTaxonomy(), 3000, "taxonomy heal", null);
    if (report && !report.skipped && (report.staleSubcategoryReset + report.staleChapterReset + report.mismatchChapterReset) > 0) {
      logger.info("[boot] taxonomy healed", report);
    }
  } catch (e) { logger.warn("[boot] taxonomy heal skipped", e); }

  markBootStep("cards:migration-done");

  // Check for interrupted writes from previous session
  checkInterruptedFlush();
}
