/**
 * Migration runner — PR-8 M1.
 *
 * Reads `PRAGMA user_version`, applies any pending migrations in order, and
 * bumps the version inside the same transaction. Idempotent: re-running on
 * an up-to-date DB is a single PRAGMA read.
 *
 * Migration sources are embedded as string constants (not file reads) so the
 * Vite build can bundle them into the Electron asar without runtime file IO.
 */
import type { SqlExecutor } from "./executor";
import schemaSql from "./schema.sql?raw";
import { migrateCategoryTaxonomyToRelational } from "./category-taxonomy-migration";
import { migrateCardSectionsIndex } from "./card-sections-index-migration";
import { migrateCardMasteryScores } from "./card-mastery-score-migration";

interface Migration {
  version: number;
  label: string;
  sql: string;
}

const PR9_M1_DISCIPLINE_DRAFTS_SQL = `
  CREATE TABLE IF NOT EXISTS disciplineLog (
    date     TEXT PRIMARY KEY,
    payload  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_discipline_date ON disciplineLog(date);

  CREATE TABLE IF NOT EXISTS drafts (
    key        TEXT PRIMARY KEY,
    source     TEXT NOT NULL,
    updatedAt  INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_drafts_source    ON drafts(source);
  CREATE INDEX IF NOT EXISTS idx_drafts_updatedAt ON drafts(updatedAt);
`;

const PR9_A1B_P14_KB_ARTICLES_SQL = `
  CREATE TABLE IF NOT EXISTS knowledgeBaseArticles (
    id           TEXT PRIMARY KEY,
    subjectId    TEXT NOT NULL,
    title        TEXT NOT NULL,
    updatedAt    INTEGER NOT NULL,
    isIndex      INTEGER NOT NULL DEFAULT 0,
    payload      TEXT NOT NULL,
    FOREIGN KEY (subjectId) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_kb_subject              ON knowledgeBaseArticles(subjectId);
  CREATE INDEX IF NOT EXISTS idx_kb_subject_updatedAt    ON knowledgeBaseArticles(subjectId, updatedAt);
  CREATE INDEX IF NOT EXISTS idx_kb_subject_title_nocase ON knowledgeBaseArticles(subjectId, title COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_kb_subject_isIndex      ON knowledgeBaseArticles(subjectId, isIndex);
`;

const PR9_A1B_P16_MNEMONIC_AUX_SQL = `
  CREATE TABLE IF NOT EXISTS majorSystem (
    id    INTEGER PRIMARY KEY,
    peg   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mnemonicTestLog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId     TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    success    INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mnemonic_test_card ON mnemonicTestLog(cardId);
  CREATE INDEX IF NOT EXISTS idx_mnemonic_test_time ON mnemonicTestLog(timestamp);
`;

const PR9_A1C3_LOG_TABLES_SQL = `
  -- PR-9 A1c-3 nastavak — log tables move to SQLite-primary.
  -- All auto-inc tables use INTEGER PRIMARY KEY AUTOINCREMENT.
  -- payload column carries the full JSON entry; denormalised columns power the
  -- handful of indexed queries (cardId/timestamp/date lookups).
  CREATE TABLE IF NOT EXISTS reviewLog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId     TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_review_card_time ON reviewLog(cardId, timestamp);
  CREATE INDEX IF NOT EXISTS idx_review_time      ON reviewLog(timestamp);

  CREATE TABLE IF NOT EXISTS pomodoroLog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pomodoro_time ON pomodoroLog(timestamp);

  CREATE TABLE IF NOT EXISTS diary (
    id       TEXT PRIMARY KEY,
    date     TEXT NOT NULL,
    payload  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_diary_date ON diary(date);

  CREATE TABLE IF NOT EXISTS calibrationLog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId     TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_calibration_card_time ON calibrationLog(cardId, timestamp);

  CREATE TABLE IF NOT EXISTS latencyLog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    cardId     TEXT NOT NULL,
    timestamp  INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_latency_card_time ON latencyLog(cardId, timestamp);

  CREATE TABLE IF NOT EXISTS slippageLog (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    date     TEXT NOT NULL,
    payload  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_slippage_date ON slippageLog(date);

  CREATE TABLE IF NOT EXISTS activityLog (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  INTEGER NOT NULL,
    payload    TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_activity_time ON activityLog(timestamp);
`;

const PR10_RELATIONAL_TAXONOMY_SQL = `
  CREATE TABLE IF NOT EXISTS subcategories (
    id           TEXT PRIMARY KEY,
    categoryId   TEXT NOT NULL,
    name         TEXT NOT NULL,
    sortOrder    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories(categoryId);

  CREATE TABLE IF NOT EXISTS chapters (
    id             TEXT PRIMARY KEY,
    subcategoryId  TEXT NOT NULL,
    name           TEXT NOT NULL,
    sortOrder      INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (subcategoryId) REFERENCES subcategories(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_chapters_subcategory ON chapters(subcategoryId);
`;

const PR11_CARD_SECTIONS_INDEX_SQL = `
  CREATE TABLE IF NOT EXISTS card_sections_index (
    card_id     TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    section_id  TEXT NOT NULL,
    state       INTEGER NOT NULL,
    next_review INTEGER NOT NULL,
    PRIMARY KEY (card_id, section_id)
  );
  CREATE INDEX IF NOT EXISTS idx_card_sections_review ON card_sections_index(next_review);
  CREATE INDEX IF NOT EXISTS idx_card_sections_state ON card_sections_index(state);
`;

const PR12_CARD_MASTERY_SCORE_SQL = `
  SELECT 1;
`;

const MIGRATIONS: readonly Migration[] = [
  { version: 1, label: "init", sql: schemaSql },
  // PR-9 M1 — disciplineLog + drafts tables (SQLite-primary).
  // Planner KV (`appSettings`, `subjectSettings:*`, `srSettings`, `appEntry`)
  // also lives in the SQLite `kv` table.
  { version: 2, label: "pr9-m1-discipline-drafts", sql: PR9_M1_DISCIPLINE_DRAFTS_SQL },
  // PR-9 A1b P1.4 — Zettelkasten articles move to SQLite-primary.
  { version: 3, label: "pr9-a1b-p14-kb-articles", sql: PR9_A1B_P14_KB_ARTICLES_SQL },
  // PR-9 A1b P1.6 — Major System + mnemonic test log move to SQLite-primary.
  { version: 4, label: "pr9-a1b-p16-mnemonic-aux", sql: PR9_A1B_P16_MNEMONIC_AUX_SQL },
  // PR-9 A1c-3 nastavak — log tables (reviewLog, pomodoroLog, diary,
  // calibrationLog, latencyLog, slippageLog, activityLog) move to SQLite.
  { version: 5, label: "pr9-a1c3-log-tables", sql: PR9_A1C3_LOG_TABLES_SQL },
  { version: 6, label: "pr10-relational-taxonomy", sql: PR10_RELATIONAL_TAXONOMY_SQL },
  { version: 7, label: "pr11-card-sections-index", sql: PR11_CARD_SECTIONS_INDEX_SQL },
  { version: 8, label: "pr12-card-mastery-score", sql: PR12_CARD_MASTERY_SCORE_SQL },
];

const TARGET_USER_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function runMigrations(exec: SqlExecutor): Promise<{ from: number; to: number }> {
  await exec.exec("PRAGMA foreign_keys = ON;");
  // journal_mode is a connection-scoped pragma — repeat it on every open
  // (handled by the client) but harmless to set here too.
  await exec.exec("PRAGMA journal_mode = WAL;");

  const versionRows = await exec.all<{ user_version: number }>("PRAGMA user_version");
  const current = Number(versionRows[0]?.user_version ?? 0);
  if (current >= TARGET_USER_VERSION) return { from: current, to: current };

  await exec.transaction(async (tx) => {
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      await tx.exec(m.sql);
      // PRAGMA user_version can't be parameter-bound; safe because m.version
      // is an integer literal from the static MIGRATIONS table.
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    }
  });

  if (TARGET_USER_VERSION >= 6) {
    await migrateCategoryTaxonomyToRelational(exec);
  }

  if (TARGET_USER_VERSION >= 7) {
    await migrateCardSectionsIndex(exec);
  }

  if (TARGET_USER_VERSION >= 8) {
    await migrateCardMasteryScores(exec);
  }

  return { from: current, to: TARGET_USER_VERSION };
}
