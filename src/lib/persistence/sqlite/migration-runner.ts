/**
 * Migration runner — PR-8 M1 / TD-ARCH-7.
 *
 * - Fresh install (user_version = 0): `applyFreshSchema` — one schema apply, zero heals.
 * - Upgrade (user_version > 0): incremental SQL migrations (frozen history) then
 *   `runPostMigrationHeals` for version-gated data heals.
 */
import type { SqlExecutor } from "./executor";
import schemaSql from "./schema.sql?raw";
import { CARD_SECTIONS_DDL } from "./card-sections";
import { applyFreshSchema } from "./migration-runner-v2";
import {
  runEditorV4OpenHeal,
  runPostMigrationHeals,
} from "./post-migration-heals";

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

/** Frozen — v8–v15: schema changes applied via post-migration heals. */
const PR12_CARD_MASTERY_SCORE_SQL = `SELECT 1;`;
const PR13_CARD_MASTERY_LEVEL_SQL = `SELECT 1;`;
const PR14_CARD_SAGA_LINKS_SQL = `SELECT 1;`;
const PR15_BOOT_LEGACY_KV_SQL = `SELECT 1;`;
const PR16_BOOT_TAXONOMY_HEAL_SQL = `SELECT 1;`;
const PR17_BOOT_FREQUENCY_TAGS_SQL = `SELECT 1;`;
const PR18_BOOT_FSRS_HEAL_SQL = `SELECT 1;`;
const PR19_EDITOR_V4_CONTENT_SQL = `SELECT 1;`;

const PR20_LEARN_PROGRESS_SQL = `
  CREATE TABLE IF NOT EXISTS learn_progress (
    card_id     TEXT PRIMARY KEY,
    payload     TEXT NOT NULL,
    updatedAt   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_learn_progress_updated ON learn_progress(updatedAt);
`;

/** TD-ARCH-8 — normalized FSRS section rows; drops legacy due index. */
const PR21_CARD_SECTIONS_NORMALIZED_SQL = `
${CARD_SECTIONS_DDL}
DROP TABLE IF EXISTS card_sections_index;
`;

/** TD-ZK-1 — concept link from a card to a Zettelkasten article. */
const PR22_CARD_ARTICLE_LINK_SQL = `
  ALTER TABLE cards ADD COLUMN linkedArticleId TEXT
    REFERENCES knowledgeBaseArticles(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_cards_linkedArticleId ON cards(linkedArticleId);
`;

const MIGRATIONS: readonly Migration[] = [
  { version: 1, label: "init", sql: schemaSql },
  { version: 2, label: "pr9-m1-discipline-drafts", sql: PR9_M1_DISCIPLINE_DRAFTS_SQL },
  { version: 3, label: "pr9-a1b-p14-kb-articles", sql: PR9_A1B_P14_KB_ARTICLES_SQL },
  { version: 4, label: "pr9-a1b-p16-mnemonic-aux", sql: PR9_A1B_P16_MNEMONIC_AUX_SQL },
  { version: 5, label: "pr9-a1c3-log-tables", sql: PR9_A1C3_LOG_TABLES_SQL },
  { version: 6, label: "pr10-relational-taxonomy", sql: PR10_RELATIONAL_TAXONOMY_SQL },
  { version: 7, label: "pr11-card-sections-index", sql: PR11_CARD_SECTIONS_INDEX_SQL },
  { version: 8, label: "pr12-card-mastery-score", sql: PR12_CARD_MASTERY_SCORE_SQL },
  { version: 9, label: "pr13-card-mastery-level", sql: PR13_CARD_MASTERY_LEVEL_SQL },
  { version: 10, label: "pr14-card-saga-links", sql: PR14_CARD_SAGA_LINKS_SQL },
  { version: 11, label: "pr15-boot-legacy-kv", sql: PR15_BOOT_LEGACY_KV_SQL },
  { version: 12, label: "pr16-boot-taxonomy-heal", sql: PR16_BOOT_TAXONOMY_HEAL_SQL },
  { version: 13, label: "pr17-boot-frequency-tags", sql: PR17_BOOT_FREQUENCY_TAGS_SQL },
  { version: 14, label: "pr18-boot-fsrs-heal", sql: PR18_BOOT_FSRS_HEAL_SQL },
  { version: 15, label: "pr19-editor-v4-content", sql: PR19_EDITOR_V4_CONTENT_SQL },
  { version: 16, label: "pr20-learn-progress", sql: PR20_LEARN_PROGRESS_SQL },
  { version: 17, label: "pr21-card-sections-normalized", sql: PR21_CARD_SECTIONS_NORMALIZED_SQL },
  { version: 18, label: "pr22-card-article-link", sql: PR22_CARD_ARTICLE_LINK_SQL },
];

const TARGET_USER_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export { TARGET_USER_VERSION };

export async function runMigrations(exec: SqlExecutor): Promise<{ from: number; to: number }> {
  await exec.exec("PRAGMA foreign_keys = ON;");
  await exec.exec("PRAGMA journal_mode = WAL;");

  const versionRows = await exec.all<{ user_version: number }>("PRAGMA user_version");
  const current = Number(versionRows[0]?.user_version ?? 0);

  if (current >= TARGET_USER_VERSION) {
    await runEditorV4OpenHeal(exec);
    return { from: current, to: current };
  }

  if (current === 0) {
    await applyFreshSchema(exec, TARGET_USER_VERSION);
    return { from: 0, to: TARGET_USER_VERSION };
  }

  const fromVersion = current;
  await exec.transaction(async (tx) => {
    for (const m of MIGRATIONS) {
      if (m.version <= fromVersion) continue;
      await tx.exec(m.sql);
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    }
  });

  await runPostMigrationHeals(exec, {
    fromVersion,
    toVersion: TARGET_USER_VERSION,
  });

  return { from: fromVersion, to: TARGET_USER_VERSION };
}
