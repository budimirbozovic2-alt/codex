import { useEffect, useRef, useState } from "react";
import { markBootStep } from "@/lib/boot-trace";
import { 
  transition, 
  getBootState, 
  installSplashBridge 
} from "@/lib/boot";
import { notifyCardsChanged } from "@/lib/db/queries";
import { useDbError } from "@/hooks/useDbError";

import { categoryRepository } from "@/lib/repositories";
import { 
  replaceReviewLog, 
  seedSrSettings 
} from "@/store/reviewSettingsStore";
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
import { 
  loadInitialData, 
  loadCardsDeferred 
} from "./card-bootstrap/loadInitialData";

import { logger } from "@/lib/logger";

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function inSchemaPhase(): boolean {
  const t = getBootState().type;
  return t === "opening" || t === "schema";
}

/**
 * Boot orchestrator — eksplicitan tro-fazni DAG. 
 * State writes route direktno u Zustand store-ove.
 *
 * Phase 1 (deferred cards): kartice se NE učitavaju na
 * kritičnoj putanji. Boot dostiže READY sa praznim
 * `cardMapStore`-om; selektori rendersuju prazne
 * kolekcije dok `loadCardsDeferred` ne završi u pozadini.
 */
export function useCardBootstrap() {
  const [ready, setReady] = useState(false);
  const initialLoadDone = useRef(false);
  
  // PR-D D2: Reagujemo na DB error stanje. Ako je prethodni
  // boot prekinut verzijom/timeout-om, RecoveryGate rendersuje
  // panel i NE SMIJEMO ciklično pokretati boot DAG nad bazom.
  const dbError = useDbError();

  useEffect(() => {
    if (dbError) {
      markBootStep("boot:gated-on-db-error", dbError.type);
      return;
    }
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    installSplashBridge();

    // OSIGURAČ: 22s ostavlja prostor za cold SQLite WASM 
    // init (~3s) + sve migracije bez lažne panike.
    // Otklonjen raw setTimeout preko taskScheduler-a.
    const panicHandle = taskScheduler.setTimeout(() => {
      setReady((currentReady) => {
        if (!currentReady) {
          logger.error(
            "[boot] Panic timeout (22s)! Forsiram ready."
          );
          const state = getBootState();
          if (
            state.type !== "ready" && 
            state.type !== "schema-error" && 
            state.type !== "load-error"
          ) {
            if (inSchemaPhase()) {
              transition({ 
                type: "SCHEMA_FAIL", 
                cause: "timeout", 
                message: "Boot panic timeout (22s)" 
              });
            } else {
              transition({ 
                type: "LOAD_FAIL", 
                message: "Boot panic timeout (22s)" 
              });
            }
          }
          forceRemoveSplash();
          return true;
        }
        return currentReady;
      });
    }, 22000, { label: "boot:panic-22s" });

    (async () => {
      try {
        // ─── Phase 1: schema ───
        const { ok } = await bootDb();
        if (!ok) return; 
        await runSchema();

        // ─── Phase 2: load (cards deferred) ───
        const { 
          catRecords, 
          log, 
          settings 
        } = await loadInitialData();

        // ─── Phase 3: render (without cards) ───
        splashProgress(95, "Finalizacija…");
        markBootStep(
          "cards:data-load-done", 
          "0 cards (deferred)"
        );

        if (import.meta.env.DEV) {
          logger.log(
            "[boot:diag] setting state — categories:", 
            catRecords.length, 
            "(cards deferred)"
          );
        }
        categoryRepository.replaceAll(catRecords);
        replaceReviewLog(log);
        seedSrSettings(settings);

        splashProgress(100, "Spremno!");
        transition({ 
          type: "LOAD_PROGRESS", 
          pct: 100, 
          label: "Spremno!" 
        });
        transition({ type: "READY" });
        markBootStep("cards:ready");

        // ─── Phase 4: deferred cards load + heal ───
        taskScheduler.idle(
          () => {
            void (async () => {
              try {
                markBootStep("cards:deferred-load-start");
                const cards = await loadCardsDeferred();
                markBootStep(
                  "cards:deferred-load-done", 
                  `${cards.length} cards (heal-only)`
                );

                // Heal pokreće rezidentni dataset. Best-effort.
                const { finalRecords } = await runHeal({ 
                  cards, 
                  catRecords, 
                  silent: true 
                });
                
                const byId = new Map(
                  finalRecords.map((r) => [r.id, r])
                );
                try {
                  await categoryRepository.commit(
                    (prev) => prev.map(
                      (r) => byId.get(r.id) ?? r
                    ),
                    "boot:deferred-heal-apply",
                  );
                } catch (e) {
                  logger.warn(
                    "[boot] deferred heal commit failed", 
                    e
                  );
                }

                // Budimo montirane potrošače kartica
                notifyCardsChanged();
              } catch (e) {
                logger.warn(
                  "[boot] deferred load failed", 
                  e
                );
                markBootStep(
                  "cards:deferred-load-failed", 
                  msg(e)
                );
              }
            })();
          },
          { 
            label: "boot:deferred-cards", 
            timeoutMs: 1500, 
            fallbackMs: 0 
          },
        );

      } catch (error) {
        const errMsg = msg(error);
        logger.error("[boot] orchestrator failed", error);
        markBootStep("cards:init-error", errMsg);

        if (
          error instanceof SchemaError || 
          inSchemaPhase()
        ) {
          const isTimeout = /timed out|timeout/i.test(errMsg);
          const cause: "unknown" | "timeout" = isTimeout 
            ? "timeout" 
            : "unknown";
          const detail = error instanceof SchemaError 
            ? `[${error.step}] ${errMsg}` 
            : errMsg;
          transition({ 
            type: "SCHEMA_FAIL", 
            cause, 
            message: detail 
          });
        } else {
          transition({ type: "LOAD_FAIL", message: errMsg });
        }

        splashProgress(100, "Greška u pokretanju");
        showSplashError(
          errMsg || "Neočekivana greška pri učitavanju."
        );
      } finally {
        setReady(true);
        taskScheduler.cancel(panicHandle);
        cleanupSplash();
        notifyElectronReady();
        
        try {
          const wScope = window as unknown as { 
            __codexAppMounted?: boolean;
            __codexSplashTimer?: any;
          };
          wScope.__codexAppMounted = true;
          
          document.getElementById("root")
            ?.setAttribute("data-app-mounted", "1");
            
          if (wScope.__codexSplashTimer) { 
            clearTimeout(wScope.__codexSplashTimer); 
            wScope.__codexSplashTimer = null; 
          }
          sessionStorage.removeItem("__codex_boot_retries");
        } catch { /* no-op */ }
      }
    })();

    return () => taskScheduler.cancel(panicHandle);
  }, [dbError]);

  return { ready };
}