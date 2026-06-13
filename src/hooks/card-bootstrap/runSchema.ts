/**
 * PR-2 — Phase 1: schema upgrade + WAL recovery.
 *
 * SQLite is the sole SSOT.
 */
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { logger } from "@/lib/logger";
import { isElectron } from "@/lib/electron-integration";

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

  const MIGRATIONS_CLEAN_FLAG = "codex-migrations-clean";
  try {
    if (localStorage.getItem(MIGRATIONS_CLEAN_FLAG) !== "1") {
      transition({ type: "SCHEMA_PROGRESS", pct: 40, label: "Schema upgrade…" });
      if (import.meta.env.DEV) logger.log("[boot:diag] schema step 1: migrateFromLocalStorage");
      const { migrateFromLocalStorage } = await import("@/lib/db-seed");
      await migrateFromLocalStorage();
      try { localStorage.setItem(MIGRATIONS_CLEAN_FLAG, "1"); } catch { /* private mode */ }
    }
  } catch (e) {
    throw new SchemaError("migrateFromLocalStorage", e);
  }

  if (isElectron()) {
    try {
      transition({ type: "SCHEMA_PROGRESS", pct: 90, label: "SQLite…" });
      const { getOpfsSqliteExecutor } = await import("@/lib/persistence/sqlite/client");
      const { ensureSqliteBootstrapped } = await import("@/lib/persistence/sqlite/migration-status");
      const exec = await getOpfsSqliteExecutor();
      await ensureSqliteBootstrapped(exec);
    } catch (e) {
      throw new SchemaError("sqlite-bootstrap", e);
    }
  }

  markBootStep("cards:schema-done");
  transition({ type: "SCHEMA_DONE" });
}
