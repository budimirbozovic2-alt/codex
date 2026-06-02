import { scheduleLogPrune } from "@/lib/log-retention";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { isLegacyDexieBypassed, assertNoLegacyIdb } from "@/lib/persistence/sqlite/migration-status";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";

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
 *
 * Audit v2 / Wave B.7: direct `splashProgress(5, "Otvaranje baze…")` call
 * was removed — the bridge in `splashBridge.ts` already maps the
 * `OPEN_START` transition to splash(5, "Otvaranje baze…") for free.
 * Bridge is the single source of truth for splash DOM updates.
 */
export async function bootDb(): Promise<{ ok: boolean }> {
  markBootStep("cards:init-start");
  transition({ type: "OPEN_START" });


  // Wave-3: SQLite executor prewarm više ne BLOKIRA boot kritičnu putanju.
  // `main.tsx` ga već trigger-uje paralelno sa `Promise.all` dynamic import-om.
  // `getOpfsSqliteExecutor()` je idempotentni singleton — prvi SQL poziv u
  // `runSchema` / `loadInitialData` će prirodno await-ovati isti promise ako
  // još nije gotov. Štedi ~3s sa kritične putanje u browser preview-u.
  // Ovdje samo defenzivno re-trigger-ujemo (no-op ako je već u toku).
  try {
    void import("@/lib/persistence/sqlite/client").then((m) => m.getOpfsSqliteExecutor());
    markBootStep("cards:sqlite-prewarm-scheduled");
  } catch (e) {
    markBootStep("cards:sqlite-prewarm-failed", e instanceof Error ? e.message : String(e));
  }

  // PR-G2 / #11 fix: previously `scheduleLogPrune()` fired here as a
  // fire-and-forget promise concurrently with `runSchema()`, racing on the
  // shared SQLite executor. Defer it to idle so the boot critical path
  // (schema migrations, initial data load) owns the executor uncontested.
  if (await isLegacyDexieBypassed()) {
    markBootStep("cards:db-open-done", "sqlite-only");
    transition({ type: "OPEN_OK" });
    taskScheduler.idle(() => scheduleLogPrune(), { label: "boot:log-prune" });
    void assertNoLegacyIdb();
    return { ok: true };
  }

  markBootStep("cards:db-open-done", "no-legacy");
  transition({ type: "OPEN_OK" });
  taskScheduler.idle(() => scheduleLogPrune(), { label: "boot:log-prune" });
  return { ok: true };
}
