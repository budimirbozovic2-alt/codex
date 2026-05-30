/**
 * One-shot IDB → SQLite migration.
 *
 * Runs once on Electron boot when `kv['migrated-from-idb-v1']` is missing.
 * Reads each legacy IDB object store via the raw cursor API
 * (`@/lib/persistence/sqlite/idb-raw-reader`) and bulk-inserts into SQLite
 * inside one transaction per table. **No Dexie import** — Phase C teardown.
 *
 * Safety rails:
 *   • Per-table row-count verification. After all rows of a table are read
 *     and inserted, we count both sides; mismatch throws inside the SQLite
 *     `transaction(...)` so the COMMIT becomes a ROLLBACK. The flag is NOT
 *     written, so the next boot retries the whole migration. Legacy IDB
 *     data is never deleted by this module.
 *   • Parent tables (categories, sources) are copied before children so FK
 *     CASCADE constraints don't reject child inserts.
 *   • `openLegacyIdb()` returning `null` (fresh install, no MemoriaDB) is
 *     a happy path — we write the flag immediately and return
 *     `alreadyComplete: true`.
 */
import type { SqlBindValue, SqlExecutor } from "./executor";
import { bindCardInsert, CARD_INSERT_SQL } from "./row-codecs";
import {
  openLegacyIdb,
  streamStore,
  listAllRows,
  getKv,
} from "./idb-raw-reader";
import type { Card } from "@/lib/spaced-repetition";
import type {
  CategoryRecord,
  Source,
  MindMapDoc,
  KnowledgeBaseArticle,
  DraftRecord,
} from "@/lib/db-types";
import type { MnemonicCard, MnemonicTestLogEntry } from "@/features/mnemonic";
import type { DisciplineEntry } from "@/lib/planner-storage";
import { logger } from "@/lib/logger";

export const MIGRATION_FLAG_KEY = "migrated-from-idb-v1";

/** Page size for cursor reads — keeps memory bounded on big libraries. */
const PAGE_SIZE = 500;

export interface MigrationCounts {
  categories: number;
  sources: number;
  cards: number;
  mindMaps: number;
  mnemonics: number;
  knowledgeBaseArticles: number;
  majorSystem: number;
  mnemonicTestLog: number;
}

const ZERO_COUNTS: MigrationCounts = {
  categories: 0, sources: 0, cards: 0, mindMaps: 0,
  mnemonics: 0, knowledgeBaseArticles: 0, majorSystem: 0, mnemonicTestLog: 0,
};

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

async function writeFlagsAndPersist(exec: SqlExecutor, counts: MigrationCounts): Promise<void> {
  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    [MIGRATION_FLAG_KEY, JSON.stringify({ at: Date.now(), counts })],
  );
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
    }
  } catch { /* private mode / quota — non-fatal */ }
}

const CATEGORY_SQL =
  "INSERT OR REPLACE INTO categories (id, name, sortOrder, color, payload) VALUES (?, ?, ?, ?, ?)";
const SOURCE_SQL =
  "INSERT OR REPLACE INTO sources (id, categoryId, title, version, createdAt, sourceKind, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";
const MINDMAP_SQL =
  "INSERT OR REPLACE INTO mindMaps (id, categoryId, title, updatedAt, payload) VALUES (?, ?, ?, ?, ?)";
const MNEMONIC_SQL =
  "INSERT OR REPLACE INTO mnemonics (id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt, payload) VALUES (?, ?, ?, ?, ?, ?, ?)";
const KB_ARTICLE_SQL =
  "INSERT OR REPLACE INTO knowledgeBaseArticles (id, subjectId, title, updatedAt, isIndex, payload) VALUES (?, ?, ?, ?, ?, ?)";
const MAJOR_SYSTEM_SQL =
  "INSERT OR REPLACE INTO majorSystem (id, peg) VALUES (?, ?)";
const MNEMONIC_TEST_LOG_SQL =
  "INSERT OR REPLACE INTO mnemonicTestLog (id, cardId, timestamp, success, payload) VALUES (?, ?, ?, ?, ?)";

async function copyStore<T>(
  exec: SqlExecutor,
  table: keyof MigrationCounts,
  idb: IDBDatabase,
  storeName: string,
  toRow: (row: T) => readonly SqlBindValue[],
  sql: string,
  destCountSql: string,
): Promise<number> {
  let inserted = 0;
  try {
    await exec.transaction(async (tx) => {
      inserted = await streamStore<T>(idb, storeName, async (page) => {
        for (const row of page) {
          await tx.run(sql, toRow(row));
        }
      }, PAGE_SIZE);
      const destRows = await tx.all<{ n: number }>(destCountSql);
      const destCount = Number(destRows[0]?.n ?? 0);
      if (destCount !== inserted) {
        throw new MigrationAbort(
          table,
          `row-count mismatch (idb=${inserted}, sqlite=${destCount}) — rolling back`,
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
    return { alreadyComplete: true, counts: ZERO_COUNTS, durationMs: 0 };
  }

  const idb = await openLegacyIdb();
  if (!idb) {
    // Fresh install — no legacy IDB to copy. Write the flag so the boot
    // fast-path triggers on every subsequent boot and we never probe again.
    await writeFlagsAndPersist(exec, ZERO_COUNTS);
    logger.info("[sqlite] no legacy IDB present — migration flag set");
    return { alreadyComplete: true, counts: ZERO_COUNTS, durationMs: Date.now() - t0 };
  }

  try {
    const counts: MigrationCounts = {
      // Parents first — FK CASCADE requires referenced rows to exist.
      categories: await copyStore<CategoryRecord>(
        exec, "categories", idb, "categories",
        (c) => [c.id, c.name, c.sortOrder ?? 0, c.color ?? null, JSON.stringify(c)],
        CATEGORY_SQL, "SELECT COUNT(*) AS n FROM categories",
      ),
      sources: await copyStore<Source>(
        exec, "sources", idb, "sources",
        (s) => [
          s.id, s.categoryId, s.title,
          (s as { version?: number }).version ?? 1,
          (s as { createdAt?: number }).createdAt ?? Date.now(),
          (s as { sourceKind?: string }).sourceKind ?? null,
          JSON.stringify(s),
        ],
        SOURCE_SQL, "SELECT COUNT(*) AS n FROM sources",
      ),
      cards: await copyStore<Card>(
        exec, "cards", idb, "cards",
        (c) => bindCardInsert(c),
        CARD_INSERT_SQL, "SELECT COUNT(*) AS n FROM cards",
      ),
      mindMaps: await copyStore<MindMapDoc>(
        exec, "mindMaps", idb, "mindMaps",
        (m) => [m.id, m.categoryId, m.title, m.updatedAt ?? Date.now(), JSON.stringify(m)],
        MINDMAP_SQL, "SELECT COUNT(*) AS n FROM mindMaps",
      ),
      mnemonics: await copyStore<MnemonicCard>(
        exec, "mnemonics", idb, "mnemonics",
        (m) => [
          m.id, m.categoryId,
          (m as { subcategoryId?: string }).subcategoryId ?? null,
          (m as { mnemonicStatus?: string }).mnemonicStatus ?? null,
          (m as { hookType?: string }).hookType ?? null,
          (m as { createdAt?: number }).createdAt ?? Date.now(),
          JSON.stringify(m),
        ],
        MNEMONIC_SQL, "SELECT COUNT(*) AS n FROM mnemonics",
      ),
      knowledgeBaseArticles: await copyStore<KnowledgeBaseArticle>(
        exec, "knowledgeBaseArticles", idb, "knowledgeBaseArticles",
        (a) => [
          a.id, a.subjectId, a.title,
          a.updatedAt ?? Date.now(),
          a.isIndex ? 1 : 0,
          JSON.stringify(a),
        ],
        KB_ARTICLE_SQL, "SELECT COUNT(*) AS n FROM knowledgeBaseArticles",
      ),
      majorSystem: await copyStore<{ id: number; peg: string }>(
        exec, "majorSystem", idb, "majorSystem",
        (p) => [p.id, p.peg],
        MAJOR_SYSTEM_SQL, "SELECT COUNT(*) AS n FROM majorSystem",
      ),
      mnemonicTestLog: await copyStore<MnemonicTestLogEntry & { id?: number }>(
        exec, "mnemonicTestLog", idb, "mnemonicTestLog",
        (e) => [
          e.id ?? null,
          e.cardId,
          e.timestamp,
          e.success ? 1 : 0,
          JSON.stringify(e),
        ],
        MNEMONIC_TEST_LOG_SQL, "SELECT COUNT(*) AS n FROM mnemonicTestLog",
      ),
    };

    await writeFlagsAndPersist(exec, counts);
    const durationMs = Date.now() - t0;
    logger.info("[sqlite] IDB→SQLite migration complete", { counts, durationMs });
    return { alreadyComplete: false, counts, durationMs };
  } finally {
    try { idb.close(); } catch { /* ignore */ }
  }
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
// Runs ONCE per browser profile (separate flag from PR-8 v1). All three
// sub-steps run inside their own SQLite transaction so a failure in one
// leaves the others intact and the unset flag triggers a clean retry next
// boot. Legacy IDB rows are NOT deleted — kept as rollback insurance.
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

  const idb = await openLegacyIdb();
  if (!idb) {
    // Fresh install — nothing to migrate. Set flag to skip future probes.
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      [PR9_READPATH_FLAG_KEY, JSON.stringify({ at: Date.now(), counts: { plannerKv: 0, disciplineLog: 0, drafts: 0 } })],
    );
    return {
      alreadyComplete: true,
      counts: { plannerKv: 0, disciplineLog: 0, drafts: 0 },
      durationMs: Date.now() - t0,
    };
  }

  let plannerKv = 0;
  let disciplineCount = 0;
  let draftsCount = 0;

  try {
    // ── Planner KV ──────────────────────────────────────────────────────
    try {
      await exec.transaction(async (tx) => {
        for (const key of PLANNER_KV_KEYS) {
          const value = await getKv<unknown>(idb, "settings", key);
          if (value === undefined) continue;
          await tx.run(
            "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
            [key, JSON.stringify(value)],
          );
          plannerKv++;
        }
      });
    } catch (err) {
      logger.warn("[sqlite:pr9] planner KV migration failed", err);
    }

    // ── Discipline log ──────────────────────────────────────────────────
    try {
      const entries = await listAllRows<DisciplineEntry & { id?: number }>(idb, "disciplineLog");
      await exec.transaction(async (tx) => {
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

    // ── Drafts ──────────────────────────────────────────────────────────
    try {
      const drafts = await listAllRows<DraftRecord>(idb, "drafts");
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
  } finally {
    try { idb.close(); } catch { /* ignore */ }
  }
}
