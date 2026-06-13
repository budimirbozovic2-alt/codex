/**
 * Boot DAG — declarative init → schema → data → ready coordinator.
 * No React dependencies; testable with AbortSignal.
 */
import { markBootStep } from "@/lib/boot-trace";
import { transition, getBootState } from "@/lib/boot";
import { emitCardsChangedForCategoryIds } from "@/lib/db/queries";
import { categoryRepository } from "@/lib/repositories";
import { replaceReviewLog, seedSrSettings } from "@/store/reviewSettingsStore";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";
import { logger } from "@/lib/logger";
import type { CategoryRecord } from "@/lib/db-types";
import { splashProgress, showSplashError } from "./splash";
import { bootDb } from "./bootDb";
import { runSchema, SchemaError } from "./runSchema";
import { runHeal } from "./runHeal";
import { loadInitialData, loadCardsDeferred } from "./loadInitialData";

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function inSchemaPhase(): boolean {
  const t = getBootState().type;
  return t === "opening" || t === "schema";
}

/** Handle boot orchestrator failures — FSM transitions + splash error UI. */
export function handleBootError(error: unknown): void {
  const errMsg = msg(error);
  logger.error("[boot] orchestrator failed", error);
  markBootStep("cards:init-error", errMsg);

  if (error instanceof SchemaError || inSchemaPhase()) {
    const isTimeout = /timed out|timeout/i.test(errMsg);
    const cause: "unknown" | "timeout" = isTimeout ? "timeout" : "unknown";
    const detail = error instanceof SchemaError ? `[${error.step}] ${errMsg}` : errMsg;
    transition({ type: "SCHEMA_FAIL", cause, message: detail });
  } else {
    transition({ type: "LOAD_FAIL", message: errMsg });
  }

  splashProgress(100, "Greška u pokretanju");
  showSplashError(errMsg || "Neočekivana greška pri učitavanju.");
}

/**
 * Critical-path boot DAG: init → schema → data → READY.
 * Cards load + heal run deferred via {@link scheduleDeferredBoot}.
 */
export async function runBootDag(signal: AbortSignal): Promise<void> {
  const { ok } = await bootDb();
  if (!ok || signal.aborted) return;

  await runSchema();
  if (signal.aborted) return;

  const { catRecords, log, settings } = await loadInitialData();
  if (signal.aborted) return;

  splashProgress(95, "Finalizacija…");
  markBootStep("cards:data-load-done", "0 cards (deferred)");

  if (import.meta.env.DEV) {
    logger.log(
      "[boot:diag] setting state — categories:",
      catRecords.length,
      "(cards deferred)",
    );
  }

  categoryRepository.replaceAll(catRecords);
  replaceReviewLog(log);
  seedSrSettings(settings);

  splashProgress(100, "Spremno!");
  transition({ type: "LOAD_PROGRESS", pct: 100, label: "Spremno!" });
  transition({ type: "READY" });
  markBootStep("cards:ready");

  if (signal.aborted) return;
  scheduleDeferredBoot(catRecords);
}

/** Post-READY background work: deferred card load + taxonomy heal. */
function scheduleDeferredBoot(catRecords: CategoryRecord[]): void {
  taskScheduler.idle(
    () => {
      void (async () => {
        try {
          markBootStep("cards:deferred-load-start");
          const cards = await loadCardsDeferred();
          markBootStep("cards:deferred-load-done", `${cards.length} cards (heal-only)`);

          const { finalRecords } = await runHeal({
            cards,
            catRecords,
            silent: true,
          });

          const byId = new Map(finalRecords.map((r) => [r.id, r]));
          try {
            await categoryRepository.commit(
              (prev) => prev.map((r) => byId.get(r.id) ?? r),
              "boot:deferred-heal-apply",
            );
          } catch (e) {
            logger.warn("[boot] deferred heal commit failed", e);
          }

          emitCardsChangedForCategoryIds(finalRecords.map((r) => r.id));

          // Idle backfill: persist contentDoc for any legacy card/source/article
          // rows still stored as HTML/markdown-only payloads.
          const { kickoffEditorV4Migration } = await import("@/lib/editor-v4/lazy-migrate");
          kickoffEditorV4Migration();
        } catch (e) {
          logger.warn("[boot] deferred load failed", e);
          markBootStep("cards:deferred-load-failed", msg(e));
        }
      })();
    },
    { label: "boot:deferred-cards", timeoutMs: 1500, fallbackMs: 0 },
  );
}
