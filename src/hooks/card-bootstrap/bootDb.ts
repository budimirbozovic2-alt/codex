import { scheduleLogPrune } from "@/lib/log-retention";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { splashProgress } from "./splash";
import { isLegacyDexieBypassed, assertNoLegacyIdb } from "@/lib/persistence/sqlite/migration-status";

/**
 * Phase C: Dexie shell is gone. Boot path is now SQLite-only.
 *
 *   • Fast path (post-migration): SQLite flag present → OPEN_OK immediately.
 *   • Cold path (fresh install OR pre-SQLite legacy IDB on disk): we still
 *     OPEN_OK here; `runSchema` Step 4 invokes `migrateFromIdb` which uses
 *     the raw IDB reader (`@/lib/persistence/sqlite/idb-raw-reader`) — no
 *     Dexie load is required.
 *
 *   Non-Electron PROD is gated upstream by `assertDesktop` (download CTA).
 */
export async function bootDb(): Promise<{ ok: boolean }> {
  markBootStep("cards:init-start");
  transition({ type: "OPEN_START" });
  splashProgress(5, "Otvaranje baze…");

  if (await isLegacyDexieBypassed()) {
    markBootStep("cards:db-open-done", "sqlite-only");
    transition({ type: "OPEN_OK" });
    scheduleLogPrune();
    void assertNoLegacyIdb();
    return { ok: true };
  }

  // Pre-migration boot (or fresh install). runSchema → migrateFromIdb will
  // handle data import via raw IDB cursor. No Dexie open needed here.
  markBootStep("cards:db-open-done", "no-legacy");
  transition({ type: "OPEN_OK" });
  scheduleLogPrune();
  return { ok: true };
}
