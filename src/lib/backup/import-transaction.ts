/**
 * Atomic backup-import transaction.
 *
 * Wraps every IDB write performed during a Restore in a *single* Dexie
 * `rw` transaction across all affected tables. If any step throws, the
 * IndexedDB state rolls back to the pre-import snapshot — no more
 * "half-replaced" databases where cards committed but sources didn't.
 *
 * The body also handles:
 *   - Category ID remap (Phase 2.1) — runs for *every* strategy, including
 *     `overwrite`, so satellite tables (sources, mindMaps, mnemonics, KB,
 *     cards) keep referencing live category UUIDs after the categories
 *     table is rewritten.
 *   - Cooperative `yieldUI()` between table batches so the progress bar
 *     keeps painting (Phase 1.1). Dexie holds the IDB lock, not the JS
 *     thread; yielding is safe inside the transaction.
 *   - Direct `db.cards.bulkPut` instead of the `schedulePersist` queue,
 *     keeping the cards write inside the same atomic boundary.
 */
import { db, idbLoadCategories, type CategoryRecord, type SubcategoryNode } from "@/lib/db";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { resolveLegacyTaxonomyNames } from "@/lib/migrations/resolve-legacy-taxonomy";
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

import { logger } from "@/lib/logger";
export type ImportStrategy = "keep" | "overwrite" | "skip" | "newer";

export interface ImportTxResult {
  /** Cards that should land in the in-memory map (post-merge). */
  merged: Card[];
  /** Final cardId → Card map snapshot, ready for setCardMapState. */
  nextMap: Record<string, Card>;
  /** Final categoryRecords snapshot for AppContext. */
  freshCategories: CategoryRecord[];
  /** Resolver report for the Toast summary. */
  legacyResolveReport: {
    resolvedSubcategory: number;
    resolvedChapter: number;
    unresolvedSubcategory: number;
    unresolvedChapter: number;
  } | null;
  /** Final SR settings, if the backup overwrote them. */
  srSettingsApplied: SRSettings | null;
  /** Final review log array if it was overwritten. */
  reviewLogApplied: ReviewLogEntry[] | null;
}

interface Ctx {
  parsed: ParsedBackup;
  strategy: ImportStrategy;
  /** Current in-memory cardMap before import (used for merge strategies). */
  currentMap: Record<string, Card>;
  onProgress?: (pct: number, label: string) => void;
}

/** Narrow `parsed.categories` (legacy union of CategoryRecord[] | string[]). */
function isCategoryRecordArray(v: ParsedBackup["categories"]): v is CategoryRecord[] {
  return v.length > 0 && typeof v[0] === "object" && v[0] !== null && "id" in v[0];
}

/** Build a categoryId remap by lowercased name match against existing rows. */
function buildCategoryIdRemap(
  parsedCats: CategoryRecord[],
  existingCats: CategoryRecord[],
): Map<string, string> {
  const existingByName = new Map<string, string>();
  for (const c of existingCats) existingByName.set(c.name.toLowerCase(), c.id);
  const remap = new Map<string, string>();
  for (const cr of parsedCats) {
    const existingId = existingByName.get(cr.name.toLowerCase());
    if (existingId && existingId !== cr.id) remap.set(cr.id, existingId);
  }
  return remap;
}

/** Apply a categoryId remap to all satellite tables in `parsed`, plus cards. */
async function applyRemapToParsed(
  remap: Map<string, string>,
  parsed: ParsedBackup,
  cardsToRemap: Card[],
  cardMap: Record<string, Card>,
): Promise<void> {
  if (remap.size === 0) return;
  let i = 0;
  for (const card of cardsToRemap) {
    const r = remap.get(card.categoryId);
    if (r) card.categoryId = r;
    if (++i % 1000 === 0) await yieldUI();
  }
  // Stream-iterate the in-memory map instead of materializing
  // `Object.values(cardMap)` (which allocates an N-sized array for a
  // 15k+ card DB). `for…in` over a plain object enumerates own keys
  // without any auxiliary allocation; periodic yields keep the UI thread
  // responsive on very large maps.
  let j = 0;
  for (const id in cardMap) {
    const card = cardMap[id];
    const r = remap.get(card.categoryId);
    if (r) card.categoryId = r;
    if (++j % 1000 === 0) await yieldUI();
  }
  for (const src of parsed.sources) {
    const r = remap.get(src.categoryId);
    if (r) src.categoryId = r;
  }
  for (const mn of parsed.mnemonics) {
    const r = remap.get(mn.categoryId);
    if (r) mn.categoryId = r;
  }
  for (const a of parsed.knowledgeBaseArticles) {
    const r = remap.get(a.subjectId);
    if (r) a.subjectId = r;
  }
  for (const m of parsed.mindMaps) {
    if (m.categoryId) {
      const r = remap.get(m.categoryId);
      if (r) m.categoryId = r;
    }
  }
}

/** Drop satellite rows whose `categoryId` no longer exists. Overwrite-only. */
function pruneOrphans(parsed: ParsedBackup, validCategoryIds: Set<string>): void {
  parsed.sources = parsed.sources.filter((s) => !s.categoryId || validCategoryIds.has(s.categoryId));
  parsed.mnemonics = parsed.mnemonics.filter((m) => !m.categoryId || validCategoryIds.has(m.categoryId));
  parsed.knowledgeBaseArticles = parsed.knowledgeBaseArticles.filter(
    (a) => !a.subjectId || validCategoryIds.has(a.subjectId),
  );
  parsed.mindMaps = parsed.mindMaps.filter((m) => !m.categoryId || validCategoryIds.has(m.categoryId));
}

// ────────────────────────────────────────────────────────────────────────
// Extracted tx helpers — each runs *inside* the parent rw transaction.
// They contain no logic changes; they merely group the body of
// `applyImportAtomically` into named, reviewable units.
// ────────────────────────────────────────────────────────────────────────

/** Pre-merge imported cards into the in-memory map per strategy (pure). */
function mergeCardsByStrategy(
  importedCards: Card[],
  currentMap: Record<string, Card>,
  strategy: ImportStrategy,
): { merged: Card[]; nextMap: Record<string, Card> } {
  const merged: Card[] = [];
  const nextMap: Record<string, Card> = { ...currentMap };

  if (strategy === "newer") {
    const getLastReview = (c: Card) =>
      c.sections.reduce((max, s) => Math.max(max, s.lastReviewed || 0), 0);
    importedCards.forEach((ic) => {
      const existing = nextMap[ic.id];
      if (!existing) { nextMap[ic.id] = ic; merged.push(ic); }
      else if (getLastReview(ic) > getLastReview(existing)) { nextMap[ic.id] = ic; merged.push(ic); }
    });
  } else if (strategy === "overwrite") {
    for (const key of Object.keys(nextMap)) delete nextMap[key];
    importedCards.forEach((ic) => { nextMap[ic.id] = ic; merged.push(ic); });
  } else {
    importedCards.forEach((ic) => {
      if (!nextMap[ic.id]) { nextMap[ic.id] = ic; merged.push(ic); }
    });
  }
  return { merged, nextMap };
}

/** Sections 4a + 4b: write categories and apply legacy `subcategories` map. */
async function writeCategoriesTx(
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  freshCategories: CategoryRecord[],
): Promise<void> {
  // 4a. Categories
  if (parsed.categories.length > 0) {
    if (isCategoryRecordArray(parsed.categories)) {
      if (strategy === "overwrite") {
        // Pre-tx remap already aligned satellite FKs to existing IDs;
        // any backup categories whose name already exists were also
        // remapped, so a clear+bulkPut here is safe.
        await db.categories.clear();
        await db.categories.bulkPut(parsed.categories);
        // FK sweep: only after categories are finalized.
        const validIds = new Set(parsed.categories.map((c) => c.id));
        pruneOrphans(parsed, validIds);
      } else {
        // Non-overwrite: bulkPut only categories that didn't get remapped.
        const existingByName = new Map<string, string>();
        for (const c of freshCategories) existingByName.set(c.name.toLowerCase(), c.id);
        const toInsert = parsed.categories.filter(
          (cr) => !existingByName.has(cr.name.toLowerCase()),
        );
        if (toInsert.length > 0) await db.categories.bulkPut(toInsert);
      }
    } else {
      // Legacy `string[]` format — create CategoryRecord[] from names.
      const legacyNames = parsed.categories;
      if (strategy === "overwrite") {
        const allRecs: CategoryRecord[] = legacyNames.map((name, i) => ({
          id: crypto.randomUUID(), name, sortOrder: i, subcategories: [],
        }));
        await db.categories.clear();
        await db.categories.bulkPut(allRecs);
      } else {
        const existingNames = new Set(freshCategories.map((r) => r.name));
        const newRecs: CategoryRecord[] = [];
        for (const name of legacyNames) {
          if (!existingNames.has(name)) {
            newRecs.push({
              id: crypto.randomUUID(),
              name,
              sortOrder: freshCategories.length + newRecs.length,
              subcategories: [],
            });
          }
        }
        if (newRecs.length > 0) await db.categories.bulkPut(newRecs);
      }
    }
  }

  // 4b. Legacy `subcategories` map (only if legacy names format).
  const isNewCatFormat = parsed.categories.length === 0 || isCategoryRecordArray(parsed.categories);
  if (parsed.subcategories && typeof parsed.subcategories === "object" && !isNewCatFormat) {
    const recs = await db.categories.toArray();
    const subData = parsed.subcategories as Record<string, string[]>;
    const updated = recs.map((r) => {
      const subs = subData[r.id] || subData[r.name] || [];
      if (subs.length === 0) return r;
      const existingNames = new Set(r.subcategories.map((n) => n.name));
      const newNodes: SubcategoryNode[] = subs
        .filter((s) => !existingNames.has(s))
        .map((name, i) => ({
          id: crypto.randomUUID(),
          name,
          chapters: [],
          sortOrder: r.subcategories.length + i,
        }));
      return { ...r, subcategories: [...r.subcategories, ...newNodes] };
    });
    await db.categories.bulkPut(updated);
  }
}

/** Section 4c: bulk write cards, prune orphans on overwrite. */
async function writeCardsTx(merged: Card[], strategy: ImportStrategy): Promise<void> {
  if (merged.length > 0) await db.cards.bulkPut(merged);
  if (strategy === "overwrite") {
    const allCardKeys = await db.cards.toCollection().primaryKeys();
    const importedIdSet = new Set(merged.map((c) => c.id));
    const orphanKeys = allCardKeys.filter((k) => !importedIdSet.has(k as string));
    if (orphanKeys.length > 0) await db.cards.bulkDelete(orphanKeys);
  }
  await yieldUI();
}

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

/**
 * A descriptor that binds a `ParsedBackup` key to its IDB table, its record
 * type `T`, and the literal name of its primary-key field `PK`. Constructing
 * one of these is a compile-time assertion that `pkField` exists on `T`.
 */
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

/** Resolve the live Dexie table for a typed descriptor. */
function tableFor<K extends keyof ParsedBackup & string, T, PK extends keyof T & string>(
  desc: BulkTableDescriptor<K, T, PK>,
): IdbBulkTable<T, PK> {
  return (db as unknown as Record<string, IdbBulkTable<T, PK>>)[desc.table];
}

// Element types of the relevant satellite tables. Imported directly from the
// owning storage modules rather than reached for through `ParsedBackup`,
// because the Zod schema there relaxes some fields to `unknown` which would
// collapse `keyof T` to `never` and defeat the compile-time PK check.
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

/** Sections 4f + 4g: sources/mindMaps/KB plus all metacognitive log tables. */
async function writeSatelliteTablesTx(
  parsed: ParsedBackup,
  strategy: ImportStrategy,
  progress: (pct: number, label: string) => void,
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
    // Erase the per-descriptor PK/T generics for the call site — the helper
    // re-reifies them internally. The compile-time pk-vs-T check still fires
    // at the `makeDescriptor(...)` declaration sites above.
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

export async function applyImportAtomically(ctx: Ctx): Promise<ImportTxResult> {
  const { parsed, strategy, currentMap, onProgress } = ctx;
  const progress = onProgress ?? (() => { /* noop */ });

  // ── 1. Pre-merge cards (in-memory only — IDB writes happen in tx below) ──
  const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, currentMap, strategy);

  // ── 2. Pre-tx remap (Phase 2.1) ──
  // Read existing categories OUTSIDE the rw tx so we can compute the remap
  // before locking. The rw tx below re-asserts the final state.
  let freshCategories: CategoryRecord[] = await idbLoadCategories();
  if (parsed.categories.length > 0 && isCategoryRecordArray(parsed.categories)) {
    const remap = buildCategoryIdRemap(parsed.categories, freshCategories);
    await applyRemapToParsed(remap, parsed, merged, nextMap);
  }

  // ── 3. Legacy taxonomy resolve (names → UUIDs) — also pre-tx (pure) ──
  let legacyResolveReport: ImportTxResult["legacyResolveReport"] = null;
  try {
    legacyResolveReport = resolveLegacyTaxonomyNames(merged, freshCategories);
    for (const c of merged) nextMap[c.id] = c;
  } catch (err) {
    logger.warn("[applyImportAtomically] legacy taxonomy resolve failed:", err);
  }

  await yieldUI();

  // Will be filled in after the transaction commits.
  let srSettingsApplied: SRSettings | null = null;
  let reviewLogApplied: ReviewLogEntry[] | null = null;

  // ── 4. SINGLE atomic transaction across every affected table ──
  const tables = [
    db.cards, db.categories, db.sources, db.mindMaps, db.knowledgeBaseArticles,
    db.reviewLog, db.diary, db.calibrationLog, db.latencyLog, db.slippageLog,
    db.activityLog, db.disciplineLog, db.pomodoroLog, db.mnemonics,
    db.majorSystem, db.mnemonicTestLog, db.settings,
  ];
  await db.transaction("rw", tables, async () => {
    progress(35, "Snimanje kategorija…");
    await writeCategoriesTx(parsed, strategy, freshCategories);

    progress(50, "Snimanje kartica…");
    await writeCardsTx(merged, strategy);

    // 4d. Review log overwrite.
    if (parsed.reviewLog.length > 0 && strategy === "overwrite") {
      progress(60, "Uvoz dnevnika ponavljanja…");
      const log = parsed.reviewLog as unknown as ReviewLogEntry[];
      reviewLogApplied = log;
      await db.reviewLog.clear();
      await db.reviewLog.bulkAdd(log);
      await yieldUI();
    }

    // 4e. SR settings (pure data — no IDB write here, applied post-tx via cb).
    if (parsed.srSettings && strategy === "overwrite") {
      srSettingsApplied = { ...DEFAULT_SR_SETTINGS, ...(parsed.srSettings as Partial<SRSettings>) };
    }

    await writeSatelliteTablesTx(parsed, strategy, progress);
  });

  // ── 5. Re-read final categories snapshot for AppContext ──
  freshCategories = await idbLoadCategories();

  return {
    merged,
    nextMap,
    freshCategories,
    legacyResolveReport,
    srSettingsApplied,
    reviewLogApplied,
  };
}
