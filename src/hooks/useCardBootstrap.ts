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

    // OSIGURAČ: 22s ostavlja prostor za cold SQLite WASM init (~3s) + sve
    // migracije (Step 4 ima vlastiti 15s `withTimeout`) bez lažnog panike.
    // Prethodno 15s je tačno racovalo sa migration timeoutom u runSchema.
    const panicTimer = setTimeout(() => {
      setReady((currentReady) => {
        if (!currentReady) {
          logger.error("[boot] Panic timeout (22s)! Forsiram ready state.");
          const state = getBootState();
          if (state.type !== "ready" && state.type !== "schema-error" && state.type !== "load-error") {
            if (inSchemaPhase()) {
              transition({ type: "SCHEMA_FAIL", cause: "timeout", message: "Boot panic timeout (22s)" });
            } else {
              transition({ type: "LOAD_FAIL", message: "Boot panic timeout (22s)" });
            }
          }
          forceRemoveSplash();
          return true;
        }
        return currentReady;
      });
    }, 22000);

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
          // Audit v2 / Wave B.5: `cause` can now actually distinguish a
          // timeout from an unknown error — the boot orchestrator's panic
          // path emits `cause: "timeout"` directly, and SchemaError messages
          // contain "timeout" only when `withTimeout` reports the fallback
          // branch. Pattern-match the failing step into the detail string
          // so the recovery UI can show it.
          const isTimeout = /timed out|timeout/i.test(errMsg);
          const cause: "unknown" | "timeout" = isTimeout ? "timeout" : "unknown";
          const detail = error instanceof SchemaError ? `[${error.step}] ${errMsg}` : errMsg;
          transition({ type: "SCHEMA_FAIL", cause, message: detail });
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
        // Wave-2 fix: signal splash retry script AFTER React boot truly
        // completes (was previously set in main.tsx right after `render()`,
        // which is before any effect or commit). This is the single point
        // where we know the app is alive and rendering.
        try {
          (window as unknown as { __codexAppMounted?: boolean }).__codexAppMounted = true;
          document.getElementById("root")?.setAttribute("data-app-mounted", "1");
          const w = window as unknown as { __codexSplashTimer?: ReturnType<typeof setTimeout> | null };
          if (w.__codexSplashTimer) { clearTimeout(w.__codexSplashTimer); w.__codexSplashTimer = null; }
          sessionStorage.removeItem("__codex_boot_retries");
        } catch { /* no-op */ }
      }
    })();

    return () => clearTimeout(panicTimer);
  }, []);

  return { ready };
}

