/**
 * PR-2 — Phase 1: schema upgrade + legacy data migracije + WAL recovery.
 *
 * Sve operacije koje *moraju* uspjeti prije nego što app uopšte može
 * čitati podatke. Ako bilo koja padne, throw-uje i orchestrator emituje
 * SCHEMA_FAIL → schema-error → BootRecoveryGate prikazuje SchemaErrorScreen.
 */
import { migrateFromLocalStorage } from "@/lib/db";
import { recoverOutboxOnBoot } from "@/lib/persist-queue";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { logger } from "@/lib/logger";
import { withTimeout } from "./withTimeout";

export class SchemaError extends Error {
  constructor(public step: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`[schema:${step}] ${msg}`);
    this.name = "SchemaError";
  }
}

export async function runSchema(): Promise<void> {
  markBootStep("cards:schema-start");
  transition({ type: "SCHEMA_START" });

  // Step 1: Dexie verzioni upgrade (i legacy localStorage migracija).
  try {
    transition({ type: "SCHEMA_PROGRESS", pct: 20, label: "Schema upgrade…" });
    if (import.meta.env.DEV) logger.log("[boot:diag] schema step 1: migrateFromLocalStorage");
    await withTimeout(migrateFromLocalStorage(), 3000, "migration", undefined);
  } catch (e) {
    throw new SchemaError("migrateFromLocalStorage", e);
  }

  // Step 2: Mnemonics localStorage → IDB migracija.
  try {
    transition({ type: "SCHEMA_PROGRESS", pct: 50, label: "Mnemonics migracija…" });
    const { migrateMnemonicsFromLocalStorageToIDB } = await import("@/features/mnemonic");
    await withTimeout(migrateMnemonicsFromLocalStorageToIDB(), 3000, "mnemonic migration", undefined);
  } catch (e) {
    throw new SchemaError("migrateMnemonics", e);
  }

  // Step 3: Outbox WAL recovery — re-apply card writes koji su crash-ovali u flush-u.
  try {
    transition({ type: "SCHEMA_PROGRESS", pct: 80, label: "Outbox recovery…" });
    await withTimeout(recoverOutboxOnBoot(), 3000, "outbox recovery", { recovered: 0 });
  } catch (e) {
    throw new SchemaError("outboxRecovery", e);
  }

  markBootStep("cards:schema-done");
  transition({ type: "SCHEMA_DONE" });
}
