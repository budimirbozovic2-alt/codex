import { useEffect, useRef, useState } from "react";
import { markBootStep } from "@/lib/boot-trace";
import { transition, getBootState, installSplashBridge } from "@/lib/boot";
import { notifyCardsChanged } from "@/lib/db/queries";


import { categoryRepository } from "@/lib/repositories";
import { replaceReviewLog, seedSrSettings } from "@/store/reviewSettingsStore";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";
import {
  splashProgress,
  showSplashError,
  cleanupSplash,
  forceRemoveSplash,
  notifyElectronReady,
} from "./card-bootstrap/splash";
import { bootDb } from "./card-bootstrap/bootDb";
import { runSchema, SchemaError } from "./card-bootstrap/runSchema";
import { runHeal } from "./card-bootstrap/runHeal";
import { loadInitialData, loadCardsDeferred } from "./card-bootstrap/loadInitialData";

import { logger } from "@/lib/logger";

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function inSchemaPhase(): boolean {
  const t = getBootState().type;
  return t === "opening" || t === "schema";
}

/**
 * Boot orchestrator — eksplicitan tro-fazni DAG. State writes route directly
 * into Zustand stores via the repositories — no setter props required.
 *
 * Phase 1 (deferred cards): cards are NOT loaded on the critical path.
 * Boot reaches READY with `cardMapStore` empty; selectors render empty
 * collections until `loadCardsDeferred` finishes in the background (via
 * `taskScheduler.idle`) and runs `runHeal` on the now-resident dataset.
 */
export function useCardBootstrap() {
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);



  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    installSplashBridge();

    // OSIGURAČ: ako se boot ne završi za 8s, emituj LOAD_FAIL i prikaži recovery UI
    const panicTimer = setTimeout(() => {
      setReady((currentReady) => {
        if (!currentReady) {
          logger.error("[boot] Panic timeout (8s)! Forsiram ready state.");
          const state = getBootState();
          if (state.type !== "ready" && state.type !== "schema-error" && state.type !== "load-error") {
            if (inSchemaPhase()) {
              transition({ type: "SCHEMA_FAIL", cause: "timeout", message: "Boot panic timeout (8s)" });
            } else {
              transition({ type: "LOAD_FAIL", message: "Boot panic timeout (8s)" });
            }
          }
          forceRemoveSplash();
          return true;
        }
        return currentReady;
      });
    }, 8000);

    (async () => {
      try {
        // ─── Phase 1: schema ───
        const { ok } = await bootDb();
        if (!ok) return; // bootDb je već emitovao SCHEMA_FAIL / version / blocked
        await runSchema();

        // ─── Phase 2: load (cards deferred) ───
        const { catRecords, log, settings } = await loadInitialData();

        // ─── Phase 3: render (without cards) ───
        splashProgress(95, "Finalizacija…");
        markBootStep("cards:data-load-done", "0 cards (deferred)");

        if (import.meta.env.DEV) logger.log("[boot:diag] setting state — categories:", catRecords.length, "(cards deferred)");
        categoryRepository.replaceAll(catRecords);
        replaceReviewLog(log);
        seedSrSettings(settings);

        splashProgress(100, "Spremno!");
        transition({ type: "LOAD_PROGRESS", pct: 100, label: "Spremno!" });
        transition({ type: "READY" });
        markBootStep("cards:ready");

        // ─── Phase 4: deferred cards load + heal (off critical path) ───
        // Phase 2b: we NEVER mirror the full table into Zustand. The cards
        // array is fetched solely so `runHeal` can perform legacy migrations
        // (taxonomy + frequencyTag). After heal, `notifyCardsChanged()`
        // invalidates TanStack `['cards']` and the UI re-queries SQLite on
        // demand via scoped hooks. `cardMapStore` stays empty until a UI
        // selector seeds it.
        taskScheduler.idle(
          () => {
            void (async () => {
              try {
                markBootStep("cards:deferred-load-start");
                const cards = await loadCardsDeferred();
                markBootStep("cards:deferred-load-done", `${cards.length} cards (heal-only)`);

                // Heal runs on the resident dataset. Never throws (best-effort).
                const { finalRecords } = await runHeal({ cards, catRecords, silent: true });
                // Patch categoryRepository with healed records (no-op if heal unchanged).
                const byId = new Map(finalRecords.map((r) => [r.id, r]));
                try {
                  await categoryRepository.commit(
                    (prev) => prev.map((r) => byId.get(r.id) ?? r),
                    "boot:deferred-heal-apply",
                  );
                } catch (e) {
                  logger.warn("[boot] deferred heal categoryRepository.commit failed (non-fatal)", e);
                }

                // Wake any mounted card consumers — they were rendering EMPTY.
                notifyCardsChanged();
              } catch (e) {
                logger.warn("[boot] deferred cards load/heal failed (non-fatal)", e);
                markBootStep("cards:deferred-load-failed", msg(e));
              }
            })();
          },
          { label: "boot:deferred-cards", timeoutMs: 1500, fallbackMs: 0 },
        );

      } catch (error) {
        const errMsg = msg(error);
        logger.error("[boot] orchestrator failed", error);
        markBootStep("cards:init-error", errMsg);

        if (error instanceof SchemaError || inSchemaPhase()) {
          const cause = error instanceof SchemaError ? "unknown" : "unknown";
          transition({ type: "SCHEMA_FAIL", cause, message: errMsg });
        } else {
          transition({ type: "LOAD_FAIL", message: errMsg });
        }
        // Legacy splash error — BootRecoveryGate će preuzeti pravu UX.
        splashProgress(100, "Greška u pokretanju");
        showSplashError(errMsg || "Neočekivana greška pri učitavanju podataka.");
      } finally {
        setReady(true);
        clearTimeout(panicTimer);
        cleanupSplash();
        notifyElectronReady();
      }
    })();

    return () => clearTimeout(panicTimer);
  }, []);

  return { ready };
}

