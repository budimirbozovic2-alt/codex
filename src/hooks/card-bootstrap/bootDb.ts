import { ensureDbOpen, getDbErrorState } from "@/lib/db";
import { scheduleLogPrune } from "@/lib/log-retention";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { splashProgress, showSplashError } from "./splash";

import { logger } from "@/lib/logger";
/** Opens IDB; on failure updates splash UI. Returns ok flag. */
export async function bootDb(): Promise<{ ok: boolean }> {
  markBootStep("cards:init-start");
  transition({ type: "OPEN_START" });
  splashProgress(5, "Otvaranje baze…");
  if (import.meta.env.DEV) logger.log("[boot:diag] step 1: ensureDbOpen");
  const dbOk = await ensureDbOpen(6000);
  markBootStep("cards:db-open-done", dbOk ? "ok" : "failed");
  if (dbOk) {
    transition({ type: "OPEN_OK" });
    scheduleLogPrune();
    return { ok: true };
  }
  const errState = getDbErrorState();
  if (errState) {
    if (errState.type === "version") {
      transition({ type: "VERSION_MISMATCH", message: errState.message });
    } else if (errState.type === "timeout") {
      transition({ type: "OPEN_TIMEOUT" });
    }
    splashProgress(100, "Greška baze podataka");
  } else {
    transition({ type: "CORRUPTED", message: "IDB nije dostupan ili je isteklo vrijeme čekanja." });
    splashProgress(100, "Pokretanje bez baze…");
    showSplashError("IndexedDB nije dostupan ili je isteklo vrijeme čekanja.");
  }
  return { ok: false };
}

