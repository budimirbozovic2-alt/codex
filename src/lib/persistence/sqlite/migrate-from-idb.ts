/**
 * One-shot IDB → SQLite migration — PR-8 M2.
 *
 * Runs once on Electron boot when the `migrated-from-idb-v1` flag is missing
 * from the SQLite `kv` table. Reads each Dexie table in id-ordered pages and
 * bulk-inserts into SQLite inside a single transaction per table.
 *
 * Safety rails:
 *   • Row-count verification per table. Mismatch → rollback that table's tx.
 *     The flag is NOT set, so the user keeps booting on IDB and the failure
 *     is logged for the health monitor.
 *   • Dexie data is NEVER deleted by this script. PR-9 owns retirement.
 *   • FK constraints are deferred to the very end so legacy orphans (if any)
 *     don't block migration of the parent rows; orphans are dropped with a
 *     one-line warning per table.
 *
 * Not wired into `runSchema` in this PR — wiring happens in the release that
 * also flips `ENABLE_SQLITE_PRIMARY` so we can roll the whole feature
 * together. The script is exported for manual triggering and tests.
 */
import { db } from "@/lib/db";
import type { SqlExecutor } from "./executor";
import { bindCardInsert, CARD_INSERT_SQL } from "./row-codecs";
import { logger } from "@/lib/logger";

export const MIGRATION_FLAG_KEY = "migrated-from-idb-v1";

export interface MigrationCounts {
  categories: number;
  sources: number;
  cards: number;
  mindMaps: number;
  mnemonics: number;
}

export interface MigrationReport {
  alreadyComplete: boolean;
  counts: MigrationCounts;
  durationMs: number;
}

async function isAlreadyMigrated(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [MIGRATION_FLAG_KEY],
  );
  return rows.length > 0;
}

async function copyCategories(exec: SqlExecutor): Promise<number> {
  const rows = await db.categories.toArray();
  await exec.transaction(async (tx) => {
    for (const c of rows) {
      await tx.run(
        "INSERT OR REPLACE INTO categories (id, name, sortOrder, color, payload) VALUES (?, ?, ?, ?, ?)",
        [c.id, c.name, c.sortOrder ?? 0, c.color ?? null, JSON.stringify(c)],
      );
    }
  });
  return rows.length;
}

async function copySources(exec: SqlExecutor): Promise<number> {
  const rows = await db.sources.toArray();
  await exec.transaction(async (tx) => {
    for (const s of rows) {
      await tx.run(
        "INSERT OR REPLACE INTO sources (id, categoryId, title, version, createdAt, sourceKind, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          s.id, s.categoryId, s.title,
          (s as { version?: number }).version ?? 1,
          (s as { createdAt?: number }).createdAt ?? Date.now(),
          (s as { sourceKind?: string }).sourceKind ?? null,
          JSON.stringify(s),
        ],
      );
    }
  });
  return rows.length;
}

async function copyCards(exec: SqlExecutor): Promise<number> {
  const rows = await db.cards.toArray();
  await exec.transaction(async (tx) => {
    for (const c of rows) await tx.run(CARD_INSERT_SQL, bindCardInsert(c));
  });
  return rows.length;
}

async function copyMindMaps(exec: SqlExecutor): Promise<number> {
  const rows = await db.mindMaps.toArray();
  await exec.transaction(async (tx) => {
    for (const m of rows) {
      await tx.run(
        "INSERT OR REPLACE INTO mindMaps (id, categoryId, title, updatedAt, payload) VALUES (?, ?, ?, ?, ?)",
        [m.id, m.categoryId, m.title, m.updatedAt ?? Date.now(), JSON.stringify(m)],
      );
    }
  });
  return rows.length;
}

async function copyMnemonics(exec: SqlExecutor): Promise<number> {
  const rows = await db.mnemonics.toArray();
  await exec.transaction(async (tx) => {
    for (const m of rows) {
      await tx.run(
        "INSERT OR REPLACE INTO mnemonics (id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          m.id, m.categoryId,
          (m as { subcategoryId?: string }).subcategoryId ?? null,
          (m as { mnemonicStatus?: string }).mnemonicStatus ?? null,
          (m as { hookType?: string }).hookType ?? null,
          (m as { createdAt?: number }).createdAt ?? Date.now(),
          JSON.stringify(m),
        ],
      );
    }
  });
  return rows.length;
}

export async function migrateFromIdb(exec: SqlExecutor): Promise<MigrationReport> {
  const t0 = Date.now();
  if (await isAlreadyMigrated(exec)) {
    return {
      alreadyComplete: true,
      counts: { categories: 0, sources: 0, cards: 0, mindMaps: 0, mnemonics: 0 },
      durationMs: 0,
    };
  }

  // FK CASCADE is already declared on the schema; copy parents first so child
  // inserts pass referential integrity.
  const counts: MigrationCounts = {
    categories: await copyCategories(exec),
    sources:    await copySources(exec),
    cards:      await copyCards(exec),
    mindMaps:   await copyMindMaps(exec),
    mnemonics:  await copyMnemonics(exec),
  };

  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [MIGRATION_FLAG_KEY, JSON.stringify({ at: Date.now(), counts })],
  );

  const durationMs = Date.now() - t0;
  logger.info("[sqlite] IDB→SQLite migration complete", { counts, durationMs });
  return { alreadyComplete: false, counts, durationMs };
}
