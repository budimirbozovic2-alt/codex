/**
 * Satellite-table write helpers (sections 4f + 4g of the import flow).
 *
 * Covers:
 *   - sources, mindMaps, knowledgeBaseArticles (UUID-keyed, hand-rolled)
 *   - all metacognitive + planner log tables (UUID-keyed or auto-increment),
 *     driven by typed `BulkTableDescriptor` records that statically bind
 *     each ParsedBackup key to its IDB table, record type, and PK field.
 *
 * Runs inside the orchestrator's rw transaction; yields between batches so
 * the progress bar repaints.
 */
import { db } from "@/lib/db";
import { yieldUI } from "@/lib/backup/yield-ui";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type {
  DiaryEntry,
  CalibrationEntry,
  LatencyEntry,
  SlippageEntry,
  ActivityEntry,
} from "@/lib/metacognitive-storage";
import type { DisciplineEntry } from "@/lib/planner/types";
import type { PomodoroLogEntry } from "@/lib/types/logs";
import type { MnemonicCard, MnemonicTestLogEntry } from "@/lib/mnemonic-storage";
import type { ImportStrategy, ProgressFn } from "@/lib/backup/import-types";

/**
 * Strongly-typed view of a Dexie table for bulk overwrite-import flows.
 *
 * `T` is the record shape and `PK` is the *literal* name of the primary-key
 * field on that record. Tying `PK` to `keyof T & string` means descriptor
 * declarations (below) fail to compile if `pkField` ever drifts away from a
 * real key on the record type, and `bulkDelete` / `primaryKeys` are inferred
 * with the correct scalar type (`string` for UUID tables, `number` for
 * auto-increment tables) instead of `unknown`.
 */
type IdbBulkTable<T, PK extends keyof T & string> = {
  bulkPut: (items: T[]) => Promise<unknown>;
  bulkAdd: (items: Array<Omit<T, PK>>) => Promise<unknown>;
  clear: () => Promise<void>;
  toCollection: () => { primaryKeys: () => Promise<Array<T[PK]>> };
  bulkDelete: (keys: Array<T[PK]>) => Promise<void>;
};

interface BulkTableDescriptor<
  K extends keyof ParsedBackup & string,
  T,
  PK extends keyof T & string,
> {
  key: K;
  table: K;
  pkField: PK;
}

function makeDescriptor<
  K extends keyof ParsedBackup & string,
  T,
  PK extends keyof T & string,
>(d: BulkTableDescriptor<K, T, PK>): BulkTableDescriptor<K, T, PK> {
  return d;
}

function tableFor<K extends keyof ParsedBackup & string, T, PK extends keyof T & string>(
  desc: BulkTableDescriptor<K, T, PK>,
): IdbBulkTable<T, PK> {
  return (db as unknown as Record<string, IdbBulkTable<T, PK>>)[desc.table];
}

type SettingsRec = { key: string; value: unknown };
type MajorSystemRec = { id: number; peg: string };
type AutoIncLog<T> = T & { id?: number };

const UUID_TABLES = [
  makeDescriptor<"diary", DiaryEntry, "id">({ key: "diary", table: "diary", pkField: "id" }),
  makeDescriptor<"mnemonics", MnemonicCard, "id">({ key: "mnemonics", table: "mnemonics", pkField: "id" }),
  makeDescriptor<"majorSystem", MajorSystemRec, "id">({ key: "majorSystem", table: "majorSystem", pkField: "id" }),
  makeDescriptor<"settings", SettingsRec, "key">({ key: "settings", table: "settings", pkField: "key" }),
] as const;

const AUTO_INC_TABLES = [
  makeDescriptor<"calibrationLog", AutoIncLog<CalibrationEntry>, "id">({ key: "calibrationLog", table: "calibrationLog", pkField: "id" }),
  makeDescriptor<"latencyLog", AutoIncLog<LatencyEntry>, "id">({ key: "latencyLog", table: "latencyLog", pkField: "id" }),
  makeDescriptor<"slippageLog", AutoIncLog<SlippageEntry>, "id">({ key: "slippageLog", table: "slippageLog", pkField: "id" }),
  makeDescriptor<"activityLog", AutoIncLog<ActivityEntry>, "id">({ key: "activityLog", table: "activityLog", pkField: "id" }),
  makeDescriptor<"disciplineLog", AutoIncLog<DisciplineEntry>, "id">({ key: "disciplineLog", table: "disciplineLog", pkField: "id" }),
  makeDescriptor<"pomodoroLog", AutoIncLog<PomodoroLogEntry>, "id">({ key: "pomodoroLog", table: "pomodoroLog", pkField: "id" }),
  makeDescriptor<"mnemonicTestLog", AutoIncLog<MnemonicTestLogEntry>, "id">({ key: "mnemonicTestLog", table: "mnemonicTestLog", pkField: "id" }),
] as const;

type AnyDescriptor =
  | (typeof UUID_TABLES)[number]
  | (typeof AUTO_INC_TABLES)[number];

export async function writeSatelliteTablesTx(
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  progress: ProgressFn,
): Promise<void> {
  // 4f. Sources, MindMaps, Knowledge-base articles.
  progress(70, "Uvoz izvora i mapa…");
  if (parsed.sources.length > 0) {
    await db.sources.bulkPut(parsed.sources);
    if (strategy === "overwrite") {
      const importedIds = new Set(parsed.sources.map((s) => s.id));
      const allKeys = await db.sources.toCollection().primaryKeys();
      const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
      if (toDelete.length > 0) await db.sources.bulkDelete(toDelete);
    }
  } else if (strategy === "overwrite") {
    await db.sources.clear();
  }
  await yieldUI();

  if (parsed.mindMaps.length > 0) {
    await db.mindMaps.bulkPut(parsed.mindMaps);
    if (strategy === "overwrite") {
      const importedIds = new Set(parsed.mindMaps.map((m) => m.id));
      const allKeys = await db.mindMaps.toCollection().primaryKeys();
      const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
      if (toDelete.length > 0) await db.mindMaps.bulkDelete(toDelete);
    }
  } else if (strategy === "overwrite") {
    await db.mindMaps.clear();
  }
  await yieldUI();

  if (parsed.knowledgeBaseArticles.length > 0) {
    await db.knowledgeBaseArticles.bulkPut(parsed.knowledgeBaseArticles);
    if (strategy === "overwrite") {
      const importedIds = new Set(parsed.knowledgeBaseArticles.map((a) => a.id));
      const allKeys = await db.knowledgeBaseArticles.toCollection().primaryKeys();
      const toDelete = allKeys.filter((k) => !importedIds.has(k as string));
      if (toDelete.length > 0) await db.knowledgeBaseArticles.bulkDelete(toDelete);
    }
  } else if (strategy === "overwrite") {
    await db.knowledgeBaseArticles.clear();
  }
  await yieldUI();

  // 4g. Metacognitive + planner satellite tables.
  progress(85, "Uvoz logova i postavki…");
  const idbTables: readonly AnyDescriptor[] = [...UUID_TABLES, ...AUTO_INC_TABLES];
  const autoIncKeys: ReadonlySet<string> = new Set(AUTO_INC_TABLES.map((t) => t.key));

  let i = 0;
  for (const desc of idbTables) {
    // Erase per-descriptor PK/T generics for the call site — the helper
    // re-reifies them internally. The compile-time pk-vs-T check still
    // fires at the `makeDescriptor(...)` declaration sites above.
    await writeOneSatelliteTable(
      parsed,
      desc as BulkTableDescriptor<string, Record<string, unknown>, string>,
      strategy,
      autoIncKeys.has(desc.key),
    );
    i++;
    progress(85 + Math.round((i / idbTables.length) * 10), `Logovi (${i}/${idbTables.length})…`);
    await yieldUI();
  }
}

/**
 * Apply a single satellite table's overwrite/upsert pass. Generic in the
 * record type and primary-key field name so `pkField` access, key-set
 * construction, and `bulkDelete` are all type-checked end-to-end.
 */
async function writeOneSatelliteTable<
  K extends keyof ParsedBackup & string,
  T,
  PK extends keyof T & string,
>(
  parsed: ParsedBackup,
  desc: BulkTableDescriptor<K, T, PK>,
  strategy: ImportStrategy,
  isAutoInc: boolean,
): Promise<void> {
  const table = tableFor(desc);
  const raw = (parsed as unknown as Record<string, unknown>)[desc.key];
  const arr = Array.isArray(raw) ? (raw as T[]) : [];

  if (arr.length === 0) {
    if (strategy === "overwrite") await table.clear();
    return;
  }

  if (strategy === "overwrite" && isAutoInc) {
    await table.clear();
    const stripped = arr.map((r) => {
      const rec = { ...(r as object) } as Record<string, unknown>;
      delete rec[desc.pkField];
      return rec as Omit<T, PK>;
    });
    await table.bulkAdd(stripped);
    return;
  }

  await table.bulkPut(arr);
  if (strategy === "overwrite") {
    const importedIds = new Set<T[PK]>(arr.map((r) => r[desc.pkField]));
    const allKeys = await table.toCollection().primaryKeys();
    const toDelete = allKeys.filter((k) => !importedIds.has(k));
    if (toDelete.length > 0) await table.bulkDelete(toDelete);
  }
}
