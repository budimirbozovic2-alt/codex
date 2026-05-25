import { useEffect, useRef, useState } from "react";
import { arrayToMap } from "@/lib/persist-queue";
import { markBootStep } from "@/lib/boot-trace";
import { transition, getBootState, installSplashBridge } from "@/lib/boot";
import { cardRepository } from "@/lib/repositories";
import { categoryRepository } from "@/lib/repositories";
import { replaceReviewLog, seedSrSettings } from "@/store/reviewSettingsStore";
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
import { loadInitialData } from "./card-bootstrap/loadInitialData";

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

        // ─── Phase 2: load ───
        const { cards, catRecords, log, settings } = await loadInitialData();

        // ─── Phase 2b: heal (never throws) ───
        const { finalRecords } = await runHeal({ cards, catRecords });

        // ─── Phase 3: render ───
        splashProgress(95, "Finalizacija…");
        markBootStep("cards:data-load-done", `${cards.length} cards`);

        if (import.meta.env.DEV) logger.log("[boot:diag] setting state — cards:", cards.length, "categories:", finalRecords.length);
        cardRepository.replaceAll(arrayToMap(cards));
        categoryRepository.replaceAll(finalRecords);
        setReviewLogState(log);
        setSrSettingsState(settings);

        splashProgress(100, "Spremno!");
        transition({ type: "LOAD_PROGRESS", pct: 100, label: "Spremno!" });
        transition({ type: "READY" });
        markBootStep("cards:ready");
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
