import { useEffect } from "react";
import { markBootStep } from "@/lib/boot-trace";
import { installSplashBridge, boot, handleBootError } from "@/lib/boot";
import { useDbError } from "@/hooks/useDbError";
import {
  cleanupSplash,
  notifyElectronReady,
} from "./card-bootstrap/splash";

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
 * React lifecycle wrapper for boot. Orchestration lives in `boot()`;
 * this hook owns abort + DOM teardown (TD-ARCH-6 — no panic timer).
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

    void boot(ac.signal)
      .catch((err) => handleBootError(err))
      .finally(() => {
        cleanupSplash();
        notifyElectronReady();
        applyBootMarkers();
      });

    return () => {
      ac.abort();
    };
  }, [dbError]);
}
