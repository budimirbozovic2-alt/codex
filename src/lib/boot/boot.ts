/**
 * Linear boot orchestrator — init → schema → data → query caches → ready.
 * TD-ARCH-6: replaces multi-step boot-dag with a single readable flow.
 */
import { markBootStep } from "@/lib/boot-trace";
import { logger } from "@/lib/logger";
import { bootDb } from "@/hooks/card-bootstrap/bootDb";
import { runSchema, SchemaError } from "@/hooks/card-bootstrap/runSchema";
import { loadInitialData } from "@/hooks/card-bootstrap/loadInitialData";
import { showSplashError } from "@/hooks/card-bootstrap/splash";
import { getBootState, transition } from "./bootStateMachine";
import { seedAllQueryCaches } from "./seed-query-caches";

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function inSchemaPhase(): boolean {
  const t = getBootState().type;
  return t === "opening" || t === "schema";
}

/** Handle boot failures — FSM transitions; splashBridge cleans up DOM. */
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

  showSplashError(errMsg || "Neočekivana greška pri učitavanju.");
}

/**
 * Critical-path boot: SQLite open → schema → satellite + DB load → TanStack seed → READY.
 */
export async function boot(signal: AbortSignal): Promise<void> {
  const { ok } = await bootDb();
  if (!ok || signal.aborted) return;

  await runSchema();
  if (signal.aborted) return;

  const { log, settings } = await loadInitialData();
  if (signal.aborted) return;

  const cardCount = await seedAllQueryCaches(signal, { log, settings });
  if (signal.aborted) return;

  if (import.meta.env.DEV) {
    logger.log("[boot:diag] boot complete — cards:", cardCount);
  }

  transition({ type: "LOAD_PROGRESS", pct: 95, label: "Finalizacija…" });
  transition({ type: "LOAD_PROGRESS", pct: 100, label: "Spremno!" });
  transition({ type: "READY" });
  markBootStep("cards:ready");
}

/** @deprecated Use `boot`. */
export const runBootDag = boot;
