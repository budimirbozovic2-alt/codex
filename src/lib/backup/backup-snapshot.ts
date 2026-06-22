/**
 * Cross-table consistent backup read — single SQLite DEFERRED transaction.
 *
 * Fixes the export-stream gap where each `listAll*` ran in its own snapshot.
 * All export tables are read inside one `exec.transaction` before streaming.
 */
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import type { Source } from "@/lib/db-types";
import { runInTransaction } from "@/lib/persistence/sqlite/client";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import {
  CARD_DECODE_SELECT,
  decodeCard,
  CardDecodeError,
} from "@/lib/persistence/sqlite/row-codecs";
import { loadAllCategoryRows } from "@/lib/persistence/sqlite/category-codecs";
import { logger } from "@/lib/logger";

const AUTO_INC_TABLES = [
  "reviewLog",
  "diary",
  "calibrationLog",
  "latencyLog",
  "slippageLog",
  "activityLog",
  "pomodoroLog",
  "disciplineLog",
  "mnemonicTestLog",
] as const;

function decodePayloadRows<T>(rows: readonly { payload: string }[]): T[] {
  const out: T[] = [];
  for (const row of rows) {
    try {
      out.push(JSON.parse(row.payload) as T);
    } catch (err) {
      logger.warn("[backup-snapshot] payload decode failed", err);
    }
  }
  return out;
}

async function readCardsInTx(tx: SqlExecutor): Promise<Card[]> {
  const rows = await tx.all<Record<string, unknown>>(
    `SELECT ${CARD_DECODE_SELECT} FROM cards`,
  );
  const cards: Card[] = [];
  for (const row of rows) {
    try {
      cards.push(decodeCard(row));
    } catch (err) {
      if (err instanceof CardDecodeError) {
        logger.warn("[backup-snapshot] skip corrupt card", { id: err.id });
      }
    }
  }
  return cards;
}

async function readPayloadTable<T>(tx: SqlExecutor, table: string): Promise<T[]> {
  const rows = await tx.all<{ payload: string }>(
    `SELECT payload FROM ${table}`,
  );
  return decodePayloadRows<T>(rows);
}

async function readAutoIncTable<T>(
  tx: SqlExecutor,
  table: (typeof AUTO_INC_TABLES)[number],
): Promise<T[]> {
  const rows = await tx.all<{ id: number; payload: string }>(
    `SELECT id, payload FROM ${table} ORDER BY id ASC`,
  );
  return rows.map((r) => JSON.parse(r.payload) as T);
}

export interface ConsistentBackupSnapshot {
  cards: Card[];
  categories: CategoryRecord[];
  sources: Source[];
  mindMaps: unknown[];
  knowledgeBaseArticles: unknown[];
  mnemonics: unknown[];
  majorSystem: unknown[];
  mnemonicTestLog: unknown[];
  disciplineLog: unknown[];
  reviewLog: unknown[];
  diary: unknown[];
  calibrationLog: unknown[];
  latencyLog: unknown[];
  slippageLog: unknown[];
  activityLog: unknown[];
  pomodoroLog: unknown[];
  settings: unknown[];
  snapshotAt: number;
}

/** Read every export table under one SQLite transaction (point-in-time). */
export async function readConsistentBackupSnapshot(): Promise<ConsistentBackupSnapshot> {
  return runInTransaction(async (tx) => {
    const [
      cards,
      categories,
      sources,
      mindMaps,
      knowledgeBaseArticles,
      mnemonics,
      majorSystem,
      reviewLog,
      diary,
      calibrationLog,
      latencyLog,
      slippageLog,
      activityLog,
      pomodoroLog,
      disciplineLog,
      mnemonicTestLog,
      settings,
    ] = await Promise.all([
      readCardsInTx(tx),
      loadAllCategoryRows(tx),
      readPayloadTable<Source>(tx, "sources"),
      readPayloadTable(tx, "mindMaps"),
      readPayloadTable(tx, "knowledgeBaseArticles"),
      readPayloadTable(tx, "mnemonics"),
      readPayloadTable(tx, "majorSystem"),
      readAutoIncTable(tx, "reviewLog"),
      readAutoIncTable(tx, "diary"),
      readAutoIncTable(tx, "calibrationLog"),
      readAutoIncTable(tx, "latencyLog"),
      readAutoIncTable(tx, "slippageLog"),
      readAutoIncTable(tx, "activityLog"),
      readAutoIncTable(tx, "pomodoroLog"),
      readAutoIncTable(tx, "disciplineLog"),
      readAutoIncTable(tx, "mnemonicTestLog"),
      tx.all<{ key: string; value: string }>("SELECT key, value FROM kv").then((rows) =>
        rows.map((r) => {
          try {
            return { key: r.key, value: JSON.parse(r.value) };
          } catch {
            return { key: r.key, value: r.value };
          }
        }),
      ),
    ]);

    return {
      cards,
      categories,
      sources,
      mindMaps,
      knowledgeBaseArticles,
      mnemonics,
      majorSystem,
      mnemonicTestLog,
      disciplineLog,
      reviewLog,
      diary,
      calibrationLog,
      latencyLog,
      slippageLog,
      activityLog,
      pomodoroLog,
      settings,
      snapshotAt: Date.now(),
    };
  });
}
