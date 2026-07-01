/**
 * Editor v4 content migration — one-shot schema step (Faza 3).
 *
 * Converts legacy HTML/markdown payloads to canonical `contentDoc` v4 at SQLite open. */
import type { SqlExecutor, SqlRow } from "./executor";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";
import type { Card } from "@/lib/spaced-repetition";
import type { MnemonicCard } from "@/domains/mnemonic";
import { migrateMnemonicCard, normalizeMnemonicCardForWrite } from "@/domains/mnemonic";
import { migrateArticle, migrateCard, migrateSource } from "@/lib/editor-v4/migrate";
import {
  bindCardInsert,
  CARD_DECODE_SELECT,
  CARD_INSERT_SQL,
  decodeCard,
} from "./row-codecs";
import { logger } from "@/lib/logger";

const BATCH_SIZE = 25;
const FLAG_KEY = "editor-v4-content-migrated-v1";

const SOURCE_INSERT_SQL = `
  INSERT OR REPLACE INTO sources (
    id, categoryId, title, version, createdAt, sourceKind, payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const ARTICLE_INSERT_SQL = `
  INSERT OR REPLACE INTO knowledgeBaseArticles
    (id, subjectId, title, updatedAt, isIndex, payload)
  VALUES (?, ?, ?, ?, ?, ?)
`;

const MNEMONIC_INSERT_SQL = `
  INSERT OR REPLACE INTO mnemonics (
    id, categoryId, subcategoryId, mnemonicStatus, hookType, createdAt, payload
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

async function hasFlag(exec: SqlExecutor): Promise<boolean> {
  const rows = await exec.all<{ value: string }>(
    "SELECT value FROM kv WHERE key = ? LIMIT 1",
    [FLAG_KEY],
  );
  return rows[0]?.value === "1";
}

async function setFlag(exec: SqlExecutor): Promise<void> {
  await exec.run("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", [
    FLAG_KEY,
    "1",
  ]);
}

function bindSource(s: Source): (string | number | null)[] {
  return [
    s.id,
    s.categoryId,
    s.title,
    s.version ?? 1,
    s.createdAt,
    s.sourceKind ?? null,
    JSON.stringify(s),
  ];
}

function bindArticle(a: KnowledgeBaseArticle): (string | number | null)[] {
  return [
    a.id,
    a.subjectId,
    a.title,
    a.updatedAt,
    a.isIndex ? 1 : 0,
    JSON.stringify(a),
  ];
}

function bindMnemonic(m: MnemonicCard): (string | number | null)[] {
  const normalized = normalizeMnemonicCardForWrite(m);
  return [
    normalized.id,
    normalized.categoryId,
    normalized.subcategoryId ?? null,
    normalized.mnemonicStatus ?? null,
    normalized.hookType ?? null,
    normalized.createdAt,
    JSON.stringify(normalized),
  ];
}

export async function migrateEditorV4Content(
  exec: SqlExecutor,
): Promise<{ cards: number; sources: number; articles: number; mnemonics: number }> {
  if (await hasFlag(exec)) {
    return { cards: 0, sources: 0, articles: 0, mnemonics: 0 };
  }

  let cardsMigrated = 0;
  let sourcesMigrated = 0;
  let articlesMigrated = 0;
  let mnemonicsMigrated = 0;

  const cardRows = await exec.all<SqlRow>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards`,
  );
  const pendingCards: Card[] = [];
  for (const row of cardRows) {
    try {
      const card = decodeCard(row);
      const res = migrateCard(card);
      if (res.changed) pendingCards.push(res.record);
    } catch {
      /* skip corrupt rows */
    }
  }
  for (let i = 0; i < pendingCards.length; i += BATCH_SIZE) {
    const batch = pendingCards.slice(i, i + BATCH_SIZE);
    await exec.transaction(async (tx) => {
      for (const card of batch) {
        await tx.run(CARD_INSERT_SQL, bindCardInsert(card));
      }
    });
    cardsMigrated += batch.length;
  }

  const sourceRows = await exec.all<{ payload: string }>(
    "SELECT payload FROM sources",
  );
  for (const row of sourceRows) {
    try {
      const source = JSON.parse(row.payload) as Source;
      const res = migrateSource(source);
      if (!res.changed) continue;
      await exec.run(SOURCE_INSERT_SQL, bindSource(res.record));
      sourcesMigrated++;
    } catch {
      /* skip */
    }
  }

  const articleRows = await exec.all<{ payload: string }>(
    "SELECT payload FROM knowledgeBaseArticles",
  );
  for (const row of articleRows) {
    try {
      const article = JSON.parse(row.payload) as KnowledgeBaseArticle;
      const res = migrateArticle(article);
      if (!res.changed) continue;
      await exec.run(ARTICLE_INSERT_SQL, bindArticle(res.record));
      articlesMigrated++;
    } catch {
      /* skip */
    }
  }

  const mnemonicRows = await exec.all<{ payload: string }>(
    "SELECT payload FROM mnemonics",
  );
  for (const row of mnemonicRows) {
    try {
      const mnemonic = JSON.parse(row.payload) as MnemonicCard;
      const res = migrateMnemonicCard(mnemonic);
      if (!res.changed) continue;
      await exec.run(MNEMONIC_INSERT_SQL, bindMnemonic(res.record));
      mnemonicsMigrated++;
    } catch {
      /* skip */
    }
  }

  await setFlag(exec);

  const total =
    cardsMigrated + sourcesMigrated + articlesMigrated + mnemonicsMigrated;
  if (total > 0) {
    logger.info(
      `[migration] editor-v4: ${cardsMigrated} cards, ${sourcesMigrated} sources, ` +
        `${articlesMigrated} articles, ${mnemonicsMigrated} mnemonics`,
    );
  }

  return {
    cards: cardsMigrated,
    sources: sourcesMigrated,
    articles: articlesMigrated,
    mnemonics: mnemonicsMigrated,
  };
}
