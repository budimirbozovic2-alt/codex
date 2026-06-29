import { scheduleLogPrune } from "@/lib/log-retention";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";
import { resetCardsQueryCache } from "@/lib/query/cache-coordinator";

/** Boot path is SQLite-only (main-process in Electron). */
export async function bootDb(): Promise<{ ok: boolean }> {
  markBootStep("cards:init-start");
  transition({ type: "OPEN_START" });

  const { ensureSqliteReady } = await import(
    "@/lib/persistence/sqlite/readyMachine"
  );
  await ensureSqliteReady();
  markBootStep("cards:sqlite-prewarm-done");

  markBootStep("cards:db-open-done", "sqlite-only");
  resetCardsQueryCache();
  transition({ type: "OPEN_OK" });
  taskScheduler.idle(() => scheduleLogPrune(), { label: "boot:log-prune" });
  return { ok: true };
}
