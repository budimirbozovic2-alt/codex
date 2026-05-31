/**
 * PR-2 — Phase 1: schema upgrade + legacy data migracije + WAL recovery.
 *
 * A1c Phase 4: when the SQLite migration flag is set, ALL Dexie-bound
 * legacy paths (localStorage→IDB, mnemonics→IDB, IDB→SQLite) are skipped.
 * SQLite is the sole SSOT, so there is nothing to migrate and no reason to
 * load the Dexie shell.
 */
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { logger } from "@/lib/logger";
import { withTimeout } from "./withTimeout";
import { isElectron } from "@/lib/electron-integration";
import { isSqliteMigrationComplete } from "@/lib/persistence/sqlite/migration-status";

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

  // A1c Phase 4 — fast path: if SQLite is already the SSOT, skip all
  // legacy migrations (and the Dexie shell load they require).
  if (isElectron()) {
    try {
      const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
      const exec = await getOpfsSqliteExecutor();
      if (await isSqliteMigrationComplete(exec)) {
        markBootStep("cards:schema-done", "sqlite-only");
        transition({ type: "SCHEMA_DONE" });
        return;
      }
    } catch (e) {
      logger.warn("[boot] schema preflight failed — falling back to legacy migrations", e);
    }
  }

  // Step 1: legacy localStorage cleanup. Sentinel-gated so realistic users
  // (no v22-era localStorage keys) skip the dynamic import entirely. Wave 4
  // removed the mnemonic→IDB step — SQLite is SSOT and that path is dead.
  const MIGRATIONS_CLEAN_FLAG = "codex-migrations-clean";
  try {
    if (localStorage.getItem(MIGRATIONS_CLEAN_FLAG) !== "1") {
      transition({ type: "SCHEMA_PROGRESS", pct: 40, label: "Schema upgrade…" });
      if (import.meta.env.DEV) logger.log("[boot:diag] schema step 1: migrateFromLocalStorage");
      const { migrateFromLocalStorage } = await import("@/lib/db-seed");
      await withTimeout(migrateFromLocalStorage(), 3000, "migration", undefined);
      try { localStorage.setItem(MIGRATIONS_CLEAN_FLAG, "1"); } catch { /* private mode */ }
    }
  } catch (e) {
    throw new SchemaError("migrateFromLocalStorage", e);
  }

  // Step 2 removed (Wave 4): mnemonics localStorage→IDB migration was a no-op
  // for every user since SQLite became SSOT in A1c-4 F6.
  // Step 3 removed (A1a): outbox WAL recovery — SQLite WAL replaces it.

  // Step 4 (PR-8 M2): One-shot IDB → SQLite migration. Electron-only because
  // OPFS-SAH-pool is unreliable in browsers today. SOFT-FAIL: failure here
  // does NOT throw SchemaError — the user keeps booting on IDB while the
  // failure is logged for the health monitor. The migration retries on the
  // next boot. Subsequent boots take the fast path above and skip this.
  try {
    transition({ type: "SCHEMA_PROGRESS", pct: 90, label: "SQLite migracija…" });
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
        { alreadyComplete: true, counts: { categories: 0, sources: 0, cards: 0, mindMaps: 0, mnemonics: 0, knowledgeBaseArticles: 0, majorSystem: 0, mnemonicTestLog: 0 }, durationMs: 0 },
      );
      if (!report.alreadyComplete) {
        logger.info("[boot] sqlite migration", report);
      }
      // PR-9 M2 — read-path migration (planner KV + disciplineLog + drafts).
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

