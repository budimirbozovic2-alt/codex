import { ensureDbOpen, getDbErrorState } from "@/lib/db";
import { scheduleLogPrune } from "@/lib/log-retention";
import { markBootStep } from "@/lib/boot-trace";
import { splashProgress, showSplashError } from "./splash";

import { logger } from "@/lib/logger";
/** Opens IDB; on failure updates splash UI. Returns ok flag. */
export async function bootDb(): Promise<{ ok: boolean }> {
  markBootStep("cards:init-start");
  splashProgress(5, "Otvaranje baze…");
  if (import.meta.env.DEV) logger.log("[boot:diag] step 1: ensureDbOpen");
  const dbOk = await ensureDbOpen(6000);
  markBootStep("cards:db-open-done", dbOk ? "ok" : "failed");
  if (dbOk) {
    scheduleLogPrune();
    return { ok: true };
  }
  const errState = getDbErrorState();
  if (errState) {
    splashProgress(100, "Greška baze podataka");
  } else {
    splashProgress(100, "Pokretanje bez baze…");
    showSplashError("IndexedDB nije dostupan ili je isteklo vrijeme čekanja.");
  }
  return { ok: false };
}
