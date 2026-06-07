/**
 * One-shot IDB -> SQLite migration engine.
 * Runs once on Electron boot when flag is missing.
 * No Dexie imports present in this context.
 *
 * PR-H7 Hardening: Full vertical comment split
 * to strictly satisfy the Safe-Paste constraints.
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
import type { 
  MnemonicCard, 
  MnemonicTestLogEntry 
} from "@/features/mnemonic";
import type { DisciplineEntry } from "@/domains/planner";
import { logger } from "@/lib/logger";

export const MIGRATION_FLAG_KEY = "migrated-from-idb-v1";
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
  mnemonics: 0, knowledgeBaseArticles: 0, majorSystem: 0, 
  mnemonicTestLog: 0,
};

export interface MigrationReport {
  alreadyComplete: boolean;
  counts: MigrationCounts;
  durationMs: number;
}

export class MigrationAbort extends Error {
  constructor(
    public table: keyof MigrationCounts, 
    public reason: string, 
    cause?: unknown
  ) {
    const msg = cause instanceof Error ? `: ${cause.message}` : "";
    super(`[sqlite:migrate] aborted at ${table} (${reason})${msg}`);
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

async function writeFlagsAndPersist(
  exec: SqlExecutor, 
  counts: MigrationCounts
): Promise<void> {
  await exec.run(
    "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
    // PR-H7 Fix: Ispravljene zagrade na kraju JSON serijalizacije
    [MIGRATION_FLAG_KEY, JSON.stringify({ at: Date.now(), counts })]
  );
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(MIGRATION_FLAG_KEY, String(Date.now()));
    }
  } catch { /* noop */ }
}

const CATEGORY_SQL =
  "INSERT OR REPLACE INTO categories VALUES (?, ?, ?, ?, ?)";
const SOURCE_SQL =
  "INSERT OR REPLACE INTO sources VALUES (?, ?, ?, ?, ?, ?, ?)";
const MINDMAP_SQL =
  "INSERT OR REPLACE INTO mindMaps VALUES (?, ?, ?, ?, ?)";
const MNEMONIC_SQL =
  "INSERT OR REPLACE INTO mnemonics VALUES (?, ?, ?, ?, ?, ?, ?)";
const KB_ARTICLE_SQL =
  "INSERT OR REPLACE INTO knowledgeBaseArticles VALUES (?, ?, ?, ?, ?, ?)";
const MAJOR_SYSTEM_SQL =
  "INSERT OR REPLACE INTO majorSystem (id, peg) VALUES (?, ?)";
const MNEMONIC_TEST_LOG_SQL =
  "INSERT OR REPLACE INTO mnemonicTestLog VALUES (?, ?, ?, ?, ?)";

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
          `Count mismatch (idb=${inserted}, sqlite=${destCount})`,
        );
      }
    });
  } catch (err) {
    if (err instanceof MigrationAbort) throw err;
    throw new MigrationAbort(table, "tx failed", err);
  }
  return inserted;
}

export async function migrateFromIdb(
  exec: SqlExecutor
): Promise<MigrationReport> {
  const t0 = Date.now();
  if (await isAlreadyMigrated(exec)) {
    return { alreadyComplete: true, counts: ZERO_COUNTS, durationMs: 0 };
  }

  const idb = await openLegacyIdb();
  if (!idb) {
    await writeFlagsAndPersist(exec, ZERO_COUNTS);
    logger.info("[sqlite] no legacy IDB present — flag set");
    return { 
      alreadyComplete: true, 
      counts: ZERO_COUNTS, 
      durationMs: Date.now() - t0 
    };
  }

  try {
    const counts: MigrationCounts = {
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
        (m) => [m.id, m.categoryId ?? null, m.title, m.updatedAt ?? Date.now(), JSON.stringify(m)],
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
    logger.info("[sqlite] IDB migration complete", { counts, durationMs });
    return { alreadyComplete: false, counts, durationMs };
  } finally {
    try { idb.close(); } catch { /* ignore */ }
  }
}

export function hasMigrationFlagSync(): boolean {
  try {
    return typeof localStorage !== "undefined"
      && localStorage.getItem(MIGRATION_FLAG_KEY) !== null;
  } catch {
    return false;
  }
}

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
    await exec.run(
      "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
      [PR9_READPATH_FLAG_KEY, JSON.stringify({ 
        at: Date.now(), 
        counts: { plannerKv: 0, disciplineLog: 0, drafts: 0 } 
      })],
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
  let plannerOk = false;
  let disciplineOk = false;
  let draftsOk = false;

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
      plannerOk = true;
    } catch (err) {
      logger.warn("[sqlite:pr9] planner KV migration failed", err);
    }

    // ── Discipline log ──────────────────────────────────────────────────
    try {
      const entries = await listAllRows<
        DisciplineEntry & { id?: number }
      >(idb, "disciplineLog");
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
      disciplineOk = true;
    } catch (err) {
      logger.warn("[sqlite:pr9] discipline log migration failed", err);
    }

    // ── Drafts ──────────────────────────────────────────────────────────
    try {
      const drafts = await listAllRows<DraftRecord>(idb, "drafts");
      await exec.transaction(async (tx) => {
        await tx.run("DELETE FROM drafts");
        for (const d of drafts) {
          const draft = d as { 
            key?: string; 
            source?: string; 
            updatedAt?: number 
          };
          if (!draft.key || !draft.source) continue;
          await tx.run(
            "INSERT OR REPLACE INTO drafts VALUES (?, ?, ?, ?)",
            [
              draft.key, 
              draft.source, 
              draft.updatedAt ?? Date.now(), 
              JSON.stringify(d)
            ],
          );
          draftsCount++;
        }
      });
      draftsOk = true;
    } catch (err) {
      logger.warn("[sqlite:pr9] drafts migration failed", err);
    }

    const counts: ReadPathMigrationCounts = {
      plannerKv,
      disciplineLog: disciplineCount,
      drafts: draftsCount,
    };

    const allOk = plannerOk && disciplineOk && draftsOk;
    if (allOk) {
      await exec.run(
        "INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)",
        [PR9_READPATH_FLAG_KEY, JSON.stringify({ at: Date.now(), counts })],
      );
    } else {
      logger.warn(
        "[sqlite:pr9] read-path migration partial failure",
        { plannerOk, disciplineOk, draftsOk, counts },
      );
    }

    const durationMs = Date.now() - t0;
    logger.info("[sqlite] PR-9 migration complete", { counts, durationMs, allOk });
    return { alreadyComplete: false, counts, durationMs };
  } finally {
    try { idb.close(); } catch { /* ignore */ }
  }
}