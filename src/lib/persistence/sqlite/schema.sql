-- PR-8 M1 — initial SQLite schema for the card write hot path and core
-- entity tables. Remaining satellite tables were added in later migrations.
--
-- Indexes mirror the original compound-index query patterns. SQLite
-- column types are advisory (declarative type affinity) — domain shapes are
-- enforced by `row-codecs.ts` on read/write.

CREATE TABLE IF NOT EXISTS categories (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  sortOrder    INTEGER NOT NULL DEFAULT 0,
  color        TEXT,
  -- subcategories + examinerProfile travel as JSON blobs; their relational
  -- explosion is left for PR-9 (read path migration). Storing as JSON keeps
  -- the v8 backup shape identical.
  payload      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id           TEXT PRIMARY KEY,
  categoryId   TEXT NOT NULL,
  title        TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  createdAt    INTEGER NOT NULL,
  sourceKind   TEXT,
  payload      TEXT NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sources_category ON sources(categoryId);
CREATE INDEX IF NOT EXISTS idx_sources_category_kind ON sources(categoryId, sourceKind);

CREATE TABLE IF NOT EXISTS cards (
  id              TEXT PRIMARY KEY,
  categoryId      TEXT NOT NULL,
  subcategoryId   TEXT,
  chapterId       TEXT,
  type            TEXT NOT NULL,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER,
  sourceId        TEXT,
  frequencyTag    TEXT,
  sourceType      TEXT,
  -- The full Card domain shape (sections, FSRS state, tags, key parts…) is
  -- serialised as JSON. Indexed columns are denormalised mirrors used by the
  -- query layer; the full domain shape lives in `payload` JSON.
  payload         TEXT NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE,
  FOREIGN KEY (sourceId)   REFERENCES sources(id)    ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_category               ON cards(categoryId);
CREATE INDEX IF NOT EXISTS idx_cards_category_subcategory   ON cards(categoryId, subcategoryId);
CREATE INDEX IF NOT EXISTS idx_cards_category_chapter       ON cards(categoryId, chapterId);
CREATE INDEX IF NOT EXISTS idx_cards_category_type          ON cards(categoryId, type);
CREATE INDEX IF NOT EXISTS idx_cards_source_created         ON cards(sourceId, createdAt);

CREATE TABLE IF NOT EXISTS mindMaps (
  id           TEXT PRIMARY KEY,
  categoryId   TEXT NOT NULL,
  title        TEXT NOT NULL,
  updatedAt    INTEGER NOT NULL,
  payload      TEXT NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mindmaps_category ON mindMaps(categoryId);

CREATE TABLE IF NOT EXISTS mnemonics (
  id              TEXT PRIMARY KEY,
  categoryId      TEXT NOT NULL,
  subcategoryId   TEXT,
  mnemonicStatus  TEXT,
  hookType        TEXT,
  createdAt       INTEGER NOT NULL,
  payload         TEXT NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mnemonics_category ON mnemonics(categoryId);

-- KV store for app settings, migration flags, and scalar config.
CREATE TABLE IF NOT EXISTS kv (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- PR-9 M1 — discipline log (one row per YYYY-MM-DD).
-- Date is the natural PK; payload carries the full DisciplineEntry JSON.
CREATE TABLE IF NOT EXISTS disciplineLog (
  date     TEXT PRIMARY KEY,
  payload  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_discipline_date ON disciplineLog(date);

-- PR-9 M1 — autosave drafts (zettelkasten article, source-html, card-form…).
-- Composite key is stable per call-site (e.g. "cardform:edit:<cardId>").
-- Source index supports `listDraftsBySource`; updatedAt index supports the
-- boot-time stale-cleanup sweep in draftRecovery.
CREATE TABLE IF NOT EXISTS drafts (
  key        TEXT PRIMARY KEY,
  source     TEXT NOT NULL,
  updatedAt  INTEGER NOT NULL,
  payload    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_source    ON drafts(source);
CREATE INDEX IF NOT EXISTS idx_drafts_updatedAt ON drafts(updatedAt);

-- PR-9 A1b P1.4 — Zettelkasten articles (knowledge base).
-- subjectId === categoryId. `title` is denormalised for case-insensitive
-- lookups via the COLLATE NOCASE compound index used by `findArticleByTitle`.
-- `isIndex` is denormalised so the per-subject Index article lookup is a
-- single indexed equality probe.
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

-- PR-9 A1b P1.6 — Major System pegs (00..99) and the mnemonic test log.
-- `majorSystem`: numeric PK + peg term. `mnemonicTestLog` is append-only
-- with auto-assigned INTEGER PRIMARY KEY.
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
