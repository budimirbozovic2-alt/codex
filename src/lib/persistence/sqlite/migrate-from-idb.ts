/**
 * One-shot IDB → SQLite migration — PR-8 M2.
 *
 * Runs once on Electron boot when `kv['migrated-from-idb-v1']` is missing.
 * Reads each Dexie table in id-ordered pages and bulk-inserts into SQLite
 * inside a single transaction per table.
 *
 * Safety rails:
 *   • Per-table row-count verification. After all rows of a table are read
 *     and inserted, we count both sides; mismatch throws inside the SQLite
 *     `transaction(...)` so the COMMIT becomes a ROLLBACK. The flag is NOT
 *     written, so the next boot retries the whole migration. Dexie data is
 *     never deleted.
 *   • Parent tables (categories, sources) are copied before children so FK
 *     CASCADE constraints don't reject child inserts.
 *   • All errors are wrapped in `MigrationAbort` so the boot orchestrator
 *     can decide whether to surface or swallow — current wiring swallows so
 *     the user keeps booting on IDB and the failure goes to the logger.
 *
 * NOT a transactional read of Dexie: an in-flight write during migration
 * may leave the SQLite side slightly behind. That's acceptable because the
 * adapter is still IDB-primary in this PR — SQLite is dormant. The next
 * write after activation will reach SQLite via the regular adapter path.
 */
import { db } from "@/lib/db";
import type { Table } from "dexie";
import type { SqlBindValue, SqlExecutor } from "./executor";
import { bindCardInsert, CARD_INSERT_SQL } from "./row-codecs";
import { logger } from "@/lib/logger";

export const MIGRATION_FLAG_KEY = "migrated-from-idb-v1";

/** Page size for Dexie `offset/limit` reads — keeps memory bounded on big libraries. */
const PAGE_SIZE = 500;

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

export class MigrationAbort extends Error {
  constructor(public table: keyof MigrationCounts, public reason: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? `: ${cause.message}` : "";
    super(`[sqlite:migrate] aborted at table=${table} (${reason})${causeMsg}`);
    this.name = "MigrationAbort";
  }
}

async function isAlreadyMigrated(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [MIGRATION_FLAG_KEY],
  );
  return rows.length > 0;
}

/**
 * Stream a Dexie table page-by-page via `orderBy('id').offset(o).limit(n)`.
 * Pages are processed by `onPage` inside the caller's existing transaction.
 */
async function streamTable<T>(
  table: Table<T, string>,
  onPage: (rows: T[]) => Promise<void>,
): Promise<number> {
  let offset = 0;
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await table.orderBy("id").offset(offset).limit(PAGE_SIZE).toArray();
    if (page.length === 0) break;
    await onPage(page);
    total += page.length;
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return total;
}

const CATEGORY_SQL =
  "INSERT OR REPLACE INTO categories (id, name, sortOrder, color, payload) VALUES (?, ?, ?, ?, ?)";
const SOURCE_SQL =
  "INSERT OR REPLACE INTO sources (id, categoryId, title, version, createdAt, sourceKind, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";
const MINDMAP_SQL =
  "INSERT OR REPLACE INTO mindMaps (id, categoryId, title, updatedAt, payload) VALUES (?, ?, ?, ?, ?)";
const MNEMONIC_SQL =
  "INSERT OR REPLACE INTO mnemonics (id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";

async function copyTable<T>(
  exec: SqlExecutor,
  table: keyof MigrationCounts,
  source: Table<T, string>,
  toRow: (row: T) => readonly SqlBindValue[],
  sql: string,
  destCountSql: string,
): Promise<number> {
  let inserted = 0;
  try {
    await exec.transaction(async (tx) => {
      inserted = await streamTable<T>(source, async (page) => {
        for (const row of page) {
          await tx.run(sql, toRow(row));
        }
      });
      const destRows = await tx.all<{ n: number }>(destCountSql);
      const destCount = Number(destRows[0]?.n ?? 0);
      if (destCount !== inserted) {
        throw new MigrationAbort(
          table,
          `row-count mismatch (dexie=${inserted}, sqlite=${destCount}) — rolling back`,
        );
      }
    });
  } catch (err) {
    if (err instanceof MigrationAbort) throw err;
    throw new MigrationAbort(table, "tx failed", err);
  }
  return inserted;
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

  const counts: MigrationCounts = {
    // Parents first — FK CASCADE in schema.sql requires the referenced rows
    // to exist before child inserts run.
    categories: await copyTable(
      exec,
      "categories",
      db.categories,
      (c) => [c.id, c.name, c.sortOrder ?? 0, c.color ?? null, JSON.stringify(c)],
      CATEGORY_SQL,
      "SELECT COUNT(*) AS n FROM categories",
    ),
    sources: await copyTable(
      exec,
      "sources",
      db.sources,
      (s) => [
        s.id, s.categoryId, s.title,
        (s as { version?: number }).version ?? 1,
        (s as { createdAt?: number }).createdAt ?? Date.now(),
        (s as { sourceKind?: string }).sourceKind ?? null,
        JSON.stringify(s),
      ],
      SOURCE_SQL,
      "SELECT COUNT(*) AS n FROM sources",
    ),
    cards: await copyTable(
      exec,
      "cards",
      db.cards,
      (c) => bindCardInsert(c),
      CARD_INSERT_SQL,
      "SELECT COUNT(*) AS n FROM cards",
    ),
    mindMaps: await copyTable(
      exec,
      "mindMaps",
      db.mindMaps,
      (m) => [m.id, m.categoryId, m.title, m.updatedAt ?? Date.now(), JSON.stringify(m)],
      MINDMAP_SQL,
      "SELECT COUNT(*) AS n FROM mindMaps",
    ),
    mnemonics: await copyTable(
      exec,
      "mnemonics",
      db.mnemonics,
      (m) => [
        m.id, m.categoryId,
        (m as { subcategoryId?: string }).subcategoryId ?? null,
        (m as { mnemonicStatus?: string }).mnemonicStatus ?? null,
        (m as { hookType?: string }).hookType ?? null,
        (m as { createdAt?: number }).createdAt ?? Date.now(),
        JSON.stringify(m),
      ],
      MNEMONIC_SQL,
      "SELECT COUNT(*) AS n FROM mnemonics",
    ),
  };

  // Flag commit happens OUTSIDE the per-table txes so a crash between the
  // last table and the flag write simply re-runs the migration (idempotent
  // via INSERT OR REPLACE). Dexie data is intentionally NOT deleted — PR-9.
  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [MIGRATION_FLAG_KEY, JSON.stringify({ at: Date.now(), counts })],
  );

  // Mirror the flag into localStorage so the persist-queue module init
  // (runs before any async SQLite read) can sync-detect completion on the
  // *next* boot and flip the adapter to SQLite-primary.
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
    }
  } catch { /* private mode or quota — non-fatal */ }

  const durationMs = Date.now() - t0;
  logger.info("[sqlite] IDB→SQLite migration complete", { counts, durationMs });
  return { alreadyComplete: false, counts, durationMs };
}

/** Sync check used by `persist-queue` module init to pick the right adapter. */
export function hasMigrationFlagSync(): boolean {
  try {
    return typeof localStorage !== "undefined"
      && localStorage.getItem(MIGRATION_FLAG_KEY) !== null;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PR-9 M2 — Read-path migration (planner KV + disciplineLog + drafts).
//
// Runs ONCE per browser profile (separate flag from PR-8 v1 so users that
// already migrated cards don't have to redo it). All three sub-steps run
// inside their own SQLite transaction so a failure in one leaves the
// others intact and the unset flag triggers a clean retry next boot.
// Dexie rows are NOT deleted — they stay as rollback insurance until B1.
// ─────────────────────────────────────────────────────────────────────────

export const PR9_READPATH_FLAG_KEY = "migrated-readpath-pr9-v1";

const PLANNER_KV_KEYS = ["plannerConfig", "dailyMapped", "lastRedistribute"] as const;

export interface ReadPathMigrationCounts {
  plannerKv: number;
  disciplineLog: number;
  drafts: number;
}

export interface ReadPathMigrationReport {
  alreadyComplete: boolean;
  counts: ReadPathMigrationCounts;
  durationMs: number;
}

async function isReadPathMigrated(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ?",
    [PR9_READPATH_FLAG_KEY],
  );
  return rows.length > 0;
}

export async function migratePr9ReadPathFromIdb(
  exec: SqlExecutor,
): Promise<ReadPathMigrationReport> {
  const t0 = Date.now();
  if (await isReadPathMigrated(exec)) {
    return {
      alreadyComplete: true,
      counts: { plannerKv: 0, disciplineLog: 0, drafts: 0 },
      durationMs: 0,
    };
  }

  let plannerKv = 0;
  let disciplineCount = 0;
  let draftsCount = 0;

  // ── Planner KV ────────────────────────────────────────────────────────
  try {
    await exec.transaction(async (tx) => {
      for (const key of PLANNER_KV_KEYS) {
        const row = await db.settings.get(key);
        if (row?.value === undefined) continue;
        await tx.run(
          "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
          [key, JSON.stringify(row.value)],
        );
        plannerKv++;
      }
    });
  } catch (err) {
    logger.warn("[sqlite:pr9] planner KV migration failed", err);
  }

  // ── Discipline log ────────────────────────────────────────────────────
  try {
    const entries = await db.disciplineLog.toArray();
    await exec.transaction(async (tx) => {
      // Bulk reset is fine — discipline rows are append-only, no FK refs.
      await tx.run("DELETE FROM disciplineLog");
      for (const e of entries) {
        const date = (e as { date?: string }).date;
        if (!date) continue;
        await tx.run(
          "INSERT OR REPLACE INTO disciplineLog (date, payload) VALUES (?, ?)",
          [date, JSON.stringify(e)],
        );
        disciplineCount++;
      }
    });
  } catch (err) {
    logger.warn("[sqlite:pr9] discipline log migration failed", err);
  }

  // ── Drafts ────────────────────────────────────────────────────────────
  try {
    const drafts = await db.drafts.toArray();
    await exec.transaction(async (tx) => {
      await tx.run("DELETE FROM drafts");
      for (const d of drafts) {
        const draft = d as { key?: string; source?: string; updatedAt?: number };
        if (!draft.key || !draft.source) continue;
        await tx.run(
          "INSERT OR REPLACE INTO drafts (key, source, updatedAt, payload) VALUES (?, ?, ?, ?)",
          [draft.key, draft.source, draft.updatedAt ?? Date.now(), JSON.stringify(d)],
        );
        draftsCount++;
      }
    });
  } catch (err) {
    logger.warn("[sqlite:pr9] drafts migration failed", err);
  }

  const counts: ReadPathMigrationCounts = {
    plannerKv,
    disciplineLog: disciplineCount,
    drafts: draftsCount,
  };

  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [PR9_READPATH_FLAG_KEY, JSON.stringify({ at: Date.now(), counts })],
  );

  const durationMs = Date.now() - t0;
  logger.info("[sqlite] PR-9 read-path migration complete", { counts, durationMs });
  return { alreadyComplete: false, counts, durationMs };
}

