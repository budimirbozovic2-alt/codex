/**
 * Satellite-table write helpers — PR-9 A1c-4.
 *
 * Runs inside the orchestrator's `exec.transaction`. Covers every non-cards,
 * non-categories table in the backup:
 *
 *   - sources, mindMaps, knowledgeBaseArticles, mnemonics, majorSystem
 *   - kv (was Dexie `settings`)
 *   - 7 log tables (reviewLog/diary/calibrationLog/latencyLog/
 *     slippageLog/activityLog/pomodoroLog)
 *   - disciplineLog (date PK)
 *   - mnemonicTestLog (auto-inc)
 *
 * Overwrite: `DELETE FROM table` + bulk insert. Non-overwrite: INSERT OR
 * REPLACE the imported subset, leave existing rows in place. Auto-inc log
 * tables on overwrite preserve incoming `id` so cross-table references
 * (none today, but cheap insurance) stay stable.
 *
 * No Dexie. No `db.transaction("rw", …)`. Every statement is a `tx.run`
 * against the outer SqlExecutor transaction.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { ImportStrategy, ProgressFn } from "@/lib/backup/import-types";
import {
  SOURCE_INSERT_SQL, bindSource,
  MINDMAP_INSERT_SQL, bindMindMap,
  KB_ARTICLE_INSERT_SQL, bindKbArticle,
  MNEMONIC_INSERT_SQL, bindMnemonic,
  MAJOR_SYSTEM_INSERT_SQL, bindMajorSystemPeg,
  KV_INSERT_SQL, bindKv,
} from "@/lib/backup/sqlite-row-bindings";

// ─── Auto-inc log table descriptor (uniform shape across 7 tables) ──────

interface AutoIncLogSpec {
  /** Key on `ParsedBackup` carrying the row array. */
  parsedKey: keyof ParsedBackup & string;
  /** Target SQLite table name. */
  table: string;
  /** Denormalised non-payload columns in INSERT order, with extractors. */
  cols: ReadonlyArray<{ name: string; pick: (row: Record<string, unknown>) => string | number }>;
}

const AUTO_INC_LOGS: readonly AutoIncLogSpec[] = [
  {
    parsedKey: "reviewLog",
    table: "reviewLog",
    cols: [
      { name: "cardId", pick: (r) => String(r.cardId ?? "") },
      { name: "timestamp", pick: (r) => Number(r.timestamp ?? 0) },
    ],
  },
  {
    parsedKey: "pomodoroLog",
    table: "pomodoroLog",
    cols: [
      { name: "timestamp", pick: (r) => Number(r.timestamp ?? 0) },
    ],
  },
  {
    parsedKey: "calibrationLog",
    table: "calibrationLog",
    cols: [
      { name: "cardId", pick: (r) => String(r.cardId ?? "") },
      { name: "timestamp", pick: (r) => Number(r.timestamp ?? 0) },
    ],
  },
  {
    parsedKey: "latencyLog",
    table: "latencyLog",
    cols: [
      { name: "cardId", pick: (r) => String(r.cardId ?? "") },
      { name: "timestamp", pick: (r) => Number(r.timestamp ?? 0) },
    ],
  },
  {
    parsedKey: "slippageLog",
    table: "slippageLog",
    cols: [
      { name: "date", pick: (r) => String(r.date ?? "") },
    ],
  },
  {
    parsedKey: "activityLog",
    table: "activityLog",
    cols: [
      { name: "timestamp", pick: (r) => Number(r.timestamp ?? 0) },
    ],
  },
];

async function writeAutoIncLog(
  tx: SqlExecutor,
  spec: AutoIncLogSpec,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
): Promise<void> {
  const raw = (parsed as unknown as Record<string, unknown>)[spec.parsedKey];
  const rows = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];

  if (rows.length === 0) {
    if (strategy === "overwrite") await tx.run(`DELETE FROM ${spec.table}`);
    return;
  }
  if (strategy === "overwrite") {
    await tx.run(`DELETE FROM ${spec.table}`);
  }

  const colNames = spec.cols.map((c) => c.name);
  for (const row of rows) {
    const insertCols: string[] = [];
    const placeholders: string[] = [];
    const values: (string | number | null)[] = [];

    if (row.id !== undefined && row.id !== null) {
      insertCols.push("id");
      placeholders.push("?");
      values.push(Number(row.id));
    }
    for (let i = 0; i < colNames.length; i++) {
      insertCols.push(colNames[i]);
      placeholders.push("?");
      values.push(spec.cols[i].pick(row));
    }
    insertCols.push("payload");
    placeholders.push("?");
    // Strip volatile `id` from payload — it's sourced from the column.
    const cleaned: Record<string, unknown> = { ...row };
    delete cleaned.id;
    values.push(JSON.stringify(cleaned));

    await tx.run(
      `INSERT OR REPLACE INTO ${spec.table} (${insertCols.join(",")}) VALUES (${placeholders.join(",")})`,
      values,
    );
  }
}

async function writeDiaryTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
): Promise<void> {
  const rows = parsed.diary as unknown as Array<{ id: string; date?: string }>;
  if (rows.length === 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM diary");
    return;
  }
  if (strategy === "overwrite") await tx.run("DELETE FROM diary");
  await tx.runMany(
    "INSERT OR REPLACE INTO diary (id, date, payload) VALUES (?, ?, ?)",
    rows.map((r) => [r.id, r.date ?? "", JSON.stringify(r)]),
  );
}


async function writeDisciplineLogTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
): Promise<void> {
  const rows = parsed.disciplineLog as unknown as Array<{ date: string }>;
  if (rows.length === 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM disciplineLog");
    return;
  }
  if (strategy === "overwrite") await tx.run("DELETE FROM disciplineLog");
  await tx.runMany(
    "INSERT OR REPLACE INTO disciplineLog (date, payload) VALUES (?, ?)",
    rows.map((r) => [String(r.date ?? ""), JSON.stringify(r)]),
  );
}


async function writeMnemonicTestLogTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
): Promise<void> {
  const rows = parsed.mnemonicTestLog as unknown as Array<{
    id?: number; cardId: string; timestamp: number; success?: boolean | number;
  }>;
  if (rows.length === 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM mnemonicTestLog");
    return;
  }
  if (strategy === "overwrite") await tx.run("DELETE FROM mnemonicTestLog");
  for (const r of rows) {
    const cleaned: Record<string, unknown> = { ...r };
    delete cleaned.id;
    if (r.id !== undefined && r.id !== null) {
      await tx.run(
        "INSERT OR REPLACE INTO mnemonicTestLog (id, cardId, timestamp, success, payload) VALUES (?, ?, ?, ?, ?)",
        [Number(r.id), r.cardId, Number(r.timestamp ?? 0), r.success ? 1 : 0, JSON.stringify(cleaned)],
      );
    } else {
      await tx.run(
        "INSERT INTO mnemonicTestLog (cardId, timestamp, success, payload) VALUES (?, ?, ?, ?)",
        [r.cardId, Number(r.timestamp ?? 0), r.success ? 1 : 0, JSON.stringify(cleaned)],
      );
    }
  }
}

// ─── Main entry point ───────────────────────────────────────────────────

export async function writeSatelliteTablesTx(
  tx: SqlExecutor,
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  progress: ProgressFn,
): Promise<void> {
  // 4f. sources / mindMaps / KB articles.
  progress(70, "Uvoz izvora i mapa…");

  if (parsed.sources.length > 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM sources");
    for (const s of parsed.sources) await tx.run(SOURCE_INSERT_SQL, bindSource(s));
  } else if (strategy === "overwrite") {
    await tx.run("DELETE FROM sources");
  }

  if (parsed.mindMaps.length > 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM mindMaps");
    for (const m of parsed.mindMaps) await tx.run(MINDMAP_INSERT_SQL, bindMindMap(m));
  } else if (strategy === "overwrite") {
    await tx.run("DELETE FROM mindMaps");
  }

  if (parsed.knowledgeBaseArticles.length > 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM knowledgeBaseArticles");
    for (const a of parsed.knowledgeBaseArticles) {
      await tx.run(KB_ARTICLE_INSERT_SQL, bindKbArticle(a));
    }
  } else if (strategy === "overwrite") {
    await tx.run("DELETE FROM knowledgeBaseArticles");
  }

  // Mnemonics + Major System.
  if (parsed.mnemonics.length > 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM mnemonics");
    for (const m of parsed.mnemonics) await tx.run(MNEMONIC_INSERT_SQL, bindMnemonic(m));
  } else if (strategy === "overwrite") {
    await tx.run("DELETE FROM mnemonics");
  }

  if (parsed.majorSystem.length > 0) {
    if (strategy === "overwrite") await tx.run("DELETE FROM majorSystem");
    for (const p of parsed.majorSystem) {
      await tx.run(MAJOR_SYSTEM_INSERT_SQL, bindMajorSystemPeg(p));
    }
  } else if (strategy === "overwrite") {
    await tx.run("DELETE FROM majorSystem");
  }

  // 4g. KV (was db.settings) + logs.
  progress(85, "Uvoz logova i postavki…");

  if (Array.isArray(parsed.settings) && parsed.settings.length > 0) {
    // Overwrite for settings is intentionally additive (no DELETE FROM kv):
    // boot-time keys like the migration flag or executor stamp must NOT
    // disappear during restore. Each row is upserted on its own key.
    for (const entry of parsed.settings) {
      await tx.run(KV_INSERT_SQL, bindKv(entry));
    }
  }

  for (const spec of AUTO_INC_LOGS) {
    await writeAutoIncLog(tx, spec, parsed, strategy);
  }
  await writeDiaryTx(tx, parsed, strategy);
  await writeDisciplineLogTx(tx, parsed, strategy);
  await writeMnemonicTestLogTx(tx, parsed, strategy);
}
