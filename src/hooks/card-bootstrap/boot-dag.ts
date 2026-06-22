/**

 * Boot DAG — declarative init → schema → data → ready coordinator.

 * No React dependencies; testable with AbortSignal.

 */

import { markBootStep } from "@/lib/boot-trace";

import { transition, getBootState } from "@/lib/boot";

import { logger } from "@/lib/logger";

import { splashProgress, showSplashError } from "./splash";

import { bootDb } from "./bootDb";

import { runSchema, SchemaError } from "./runSchema";

import { loadInitialData } from "./loadInitialData";

import {

  commitCardsWriteFromDb,

  ensureCardsBootCache,

  getCardsCacheWriteGeneration,

} from "@/lib/query/cards-cache-coordinator";

import {

  commitCategoriesWriteFromDb,

  ensureCategoriesBootCache,

  getCategoriesCacheWriteGeneration,

} from "@/lib/query/categories-cache-coordinator";

import {

  REVIEW_LOG_BOOT_DAYS,

  seedReviewLogCache,

  seedSrSettingsCache,

} from "@/lib/query/review-settings-cache-coordinator";



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

 * Critical-path boot DAG: init → schema → data → cards cache → READY.

 * Data heal + editor-v4 migration run during SQLite schema migrations (v11–v15).

 */

export async function runBootDag(signal: AbortSignal): Promise<void> {

  const { ok } = await bootDb();

  if (!ok || signal.aborted) return;



  await runSchema();

  if (signal.aborted) return;



  const { catRecords, log, settings } = await loadInitialData();

  if (signal.aborted) return;



  seedReviewLogCache(log, REVIEW_LOG_BOOT_DAYS);

  seedSrSettingsCache(settings);



  const catWriteGen = getCategoriesCacheWriteGeneration();

  let catCount = await ensureCategoriesBootCache(catWriteGen, signal);

  if (signal.aborted) return;

  if (catCount < 0 && !signal.aborted) {

    catCount = await commitCategoriesWriteFromDb(getCategoriesCacheWriteGeneration());

  }



  splashProgress(70, "Učitavanje kartica…");

  transition({ type: "LOAD_PROGRESS", pct: 70, label: "Učitavanje kartica…" });

  markBootStep("cards:cache-ensure-start");



  const writeGenAtStart = getCardsCacheWriteGeneration();

  let cardCount = await ensureCardsBootCache(writeGenAtStart, signal);

  if (signal.aborted) return;

  if (cardCount < 0) {

    const retryGen = getCardsCacheWriteGeneration();

    cardCount = await ensureCardsBootCache(retryGen, signal);

    if (cardCount < 0 && !signal.aborted) {

      cardCount = await commitCardsWriteFromDb(retryGen);

    }

  }

  markBootStep("cards:data-load-done", `${cardCount} cards`);



  if (import.meta.env.DEV) {

    logger.log(

      "[boot:diag] setting state — categories:",

      catRecords.length,

      "cards:",

      cardCount,

    );

  }



  splashProgress(95, "Finalizacija…");

  transition({ type: "LOAD_PROGRESS", pct: 95, label: "Finalizacija…" });



  splashProgress(100, "Spremno!");

  transition({ type: "LOAD_PROGRESS", pct: 100, label: "Spremno!" });

  transition({ type: "READY" });

  markBootStep("cards:ready");

}


