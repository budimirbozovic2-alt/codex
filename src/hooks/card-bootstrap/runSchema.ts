/**
 * PR-2 — Phase 1: schema upgrade + legacy data migracije + WAL recovery.
 *
 * Sve operacije koje *moraju* uspjeti prije nego što app uopšte može
 * čitati podatke. Ako bilo koja padne, throw-uje i orchestrator emituje
 * SCHEMA_FAIL → schema-error → BootRecoveryGate prikazuje SchemaErrorScreen.
 */
import { migrateFromLocalStorage } from "@/lib/db";
// Outbox recovery removed in A1a — SQLite WAL handles durability.
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

  // Step 3 removed (A1a): outbox WAL recovery — SQLite WAL replaces it.


  // Step 4 (PR-8 M2): One-shot IDB → SQLite migration. Electron-only because
  // OPFS-SAH-pool is unreliable in browsers today. SOFT-FAIL: failure here
  // does NOT throw SchemaError — the SQLite adapter is dormant in this
  // release, so the user keeps booting on IDB while the failure is logged
  // for the health monitor. The migration retries on the next boot.
  try {
    transition({ type: "SCHEMA_PROGRESS", pct: 90, label: "SQLite migracija…" });
    const { isElectron } = await import("@/lib/electron-integration");
    if (isElectron()) {
      const [{ getOpfsSqliteExecutor }, migrateMod] = await Promise.all([
        import("@/lib/persistence/sqlite/client"),
        import("@/lib/persistence/sqlite/migrate-from-idb"),
      ]);
      const exec = await getOpfsSqliteExecutor();
      const report = await withTimeout(
        migrateMod.migrateFromIdb(exec),
        15000,
        "sqlite migration",
        { alreadyComplete: true, counts: { categories: 0, sources: 0, cards: 0, mindMaps: 0, mnemonics: 0 }, durationMs: 0 },
      );
      if (!report.alreadyComplete) {
        logger.info("[boot] sqlite migration", report);
      }
      // PR-9 M2 — read-path migration (planner KV + disciplineLog + drafts).
      // Independent flag, so retries cleanly if a transient failure occurs.
      const pr9Report = await withTimeout(
        migrateMod.migratePr9ReadPathFromIdb(exec),
        10000,
        "sqlite pr9 read-path migration",
        { alreadyComplete: true, counts: { plannerKv: 0, disciplineLog: 0, drafts: 0 }, durationMs: 0 },
      );
      if (!pr9Report.alreadyComplete) {
        logger.info("[boot] sqlite pr9 read-path migration", pr9Report);
      }
    }
  } catch (e) {
    logger.warn("[boot] sqlite migration failed (soft) — user continues on IDB", e);
  }

  markBootStep("cards:schema-done");
  transition({ type: "SCHEMA_DONE" });
}
