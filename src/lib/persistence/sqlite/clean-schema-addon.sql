-- TD-ARCH-7: remainder of final schema not yet in schema.sql (v5, v6, v16, card alters).

-- PR-9 A1c-3 — log tables
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

-- PR-10 — relational taxonomy
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

-- PR-20 — learn progress
CREATE TABLE IF NOT EXISTS learn_progress (
  card_id     TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  updatedAt   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_learn_progress_updated ON learn_progress(updatedAt);

-- TD-ARCH-8 — normalized FSRS section rows (fresh install; no legacy index)
CREATE TABLE IF NOT EXISTS card_sections (
  card_id              TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  section_id           TEXT NOT NULL,
  state                INTEGER NOT NULL,
  stability            REAL NOT NULL DEFAULT 0,
  difficulty           REAL NOT NULL DEFAULT 0,
  interval_days        REAL NOT NULL DEFAULT 0,
  next_review          INTEGER NOT NULL,
  last_reviewed        INTEGER,
  lapses               INTEGER NOT NULL DEFAULT 0,
  elapsed_days         REAL NOT NULL DEFAULT 0,
  scheduled_days       REAL NOT NULL DEFAULT 0,
  first_review_pending INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, section_id)
);
CREATE INDEX IF NOT EXISTS idx_card_sections_due ON card_sections(state, next_review);
CREATE INDEX IF NOT EXISTS idx_card_sections_card ON card_sections(card_id);

-- PR-13/14 — card columns added via TS heals on legacy DBs; included on fresh install.
ALTER TABLE cards ADD COLUMN mastery_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cards ADD COLUMN parentId TEXT REFERENCES cards(id) ON DELETE SET NULL;
ALTER TABLE cards ADD COLUMN isEndangered INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_cards_parentId ON cards(parentId);
CREATE INDEX IF NOT EXISTS idx_cards_isEndangered ON cards(isEndangered);

-- TD-ZK-1 — concept link from a card to a Zettelkasten article (v18).
ALTER TABLE cards ADD COLUMN linkedArticleId TEXT REFERENCES knowledgeBaseArticles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cards_linkedArticleId ON cards(linkedArticleId);
