import { useEffect } from "react";
import { markBootStep } from "@/lib/boot-trace";
import { transition, getBootState, installSplashBridge } from "@/lib/boot";
import { useDbError } from "@/hooks/useDbError";
import { taskScheduler } from "@/lib/scheduler/taskScheduler";
import { logger } from "@/lib/logger";
import {
  cleanupSplash,
  forceRemoveSplash,
  notifyElectronReady,
} from "./card-bootstrap/splash";
import { runBootDag, handleBootError } from "./card-bootstrap/boot-dag";

function inSchemaPhase(): boolean {
  const t = getBootState().type;
  return t === "opening" || t === "schema";
}

function applyBootMarkers(): void {
  try {
    const wScope = window as unknown as {
      __codexAppMounted?: boolean;
      __codexSplashTimer?: ReturnType<typeof setTimeout> | null;
    };
    wScope.__codexAppMounted = true;
    document.getElementById("root")?.setAttribute("data-app-mounted", "1");
    if (wScope.__codexSplashTimer) {
      clearTimeout(wScope.__codexSplashTimer);
      wScope.__codexSplashTimer = null;
    }
    sessionStorage.removeItem("__codex_boot_retries");
  } catch {
    /* no-op */
  }
}

/**
 * React lifecycle wrapper for the boot DAG.
 * Orchestration lives in `runBootDag`; this hook owns timers, abort, and DOM teardown.
 */
export function useCardBootstrap(): void {
  const dbError = useDbError();

  useEffect(() => {
    if (dbError) {
      markBootStep("boot:gated-on-db-error", dbError.type);
      return;
    }

    installSplashBridge();
    const ac = new AbortController();
    let bootDone = false;

    const panicHandle = taskScheduler.setTimeout(() => {
      if (bootDone) return;
      logger.error("[boot] Panic timeout (22s)! Forsiram ready.");
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
            message: "Boot panic timeout (22s)",
          });
        } else {
          transition({
            type: "LOAD_FAIL",
            message: "Boot panic timeout (22s)",
          });
        }
      }
      ac.abort();
      forceRemoveSplash();
    }, 22000, { label: "boot:panic-22s" });

    void runBootDag(ac.signal)
      .catch((err) => handleBootError(err))
      .finally(() => {
        bootDone = true;
        taskScheduler.cancel(panicHandle);
        cleanupSplash();
        notifyElectronReady();
        applyBootMarkers();
      });

    return () => {
      ac.abort();
      taskScheduler.cancel(panicHandle);
    };
  }, [dbError]);
}
