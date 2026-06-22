/**
 * Faza 0 — helpers for export → parse → import roundtrip contract tests.
 */
import type { CategoryRecord } from "@/lib/db-types";
import {
  readAllCardsForBackup,
  readAllCategoriesForBackup,
  readAllSourcesForBackup,
  readAllMindMapsForBackup,
  readAllKbArticlesForBackup,
  readAllMnemonicsForBackup,
  readAllMajorSystemForBackup,
  readAllMnemonicTestLogForBackup,
  readAllDisciplineLogForBackup,
  readReviewLog,
  readDiary,
  readCalibrationLog,
  readLatencyLog,
  readSlippageLog,
  readActivityLog,
  readPomodoroLog,
  readSettingsTableRaw,
} from "@/lib/db/queries";
import { streamBackup, sourceSpec } from "@/lib/backup/export-stream";
import { exportLegacyLocalStorageData } from "@/lib/backup/legacy-local-storage";
import {
  BackupSchema,
  type ParsedBackup,
} from "@/lib/migrations/backup-schema";
import { migrateBackup } from "@/lib/backup/migrate";
import { healBackupRaw } from "@/lib/backup/heal-backup";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import { applyImportAtomically } from "@/lib/backup/import-transaction";
import {
  abortAllCachesWrite,
  beginAllCachesWrite,
  commitAllCachesFromDb,
} from "@/lib/query/all-caches-coordinator";

function deriveSubMap(catRecords: CategoryRecord[]): Record<string, string[]> {
  const subMap: Record<string, string[]> = {};
  for (const r of catRecords) {
    if (r.subcategories.length > 0) {
      subMap[r.name] = r.subcategories.map((s) => s.name);
    }
  }
  return subMap;
}

/** Build a production-shaped v7 full backup blob from current SQLite rows. */
export async function buildFullBackupBlob(options?: {
  srSettings?: SRSettings;
}): Promise<Blob> {
  const catRecords = await readAllCategoriesForBackup();
  const sortedCats = [...catRecords].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const localStorageData = await exportLegacyLocalStorageData();

  return streamBackup({
    version: 7,
    type: "full",
    scalars: {
      subcategories: deriveSubMap(sortedCats),
      srSettings: options?.srSettings ?? DEFAULT_SR_SETTINGS,
      localStorageData,
    },
    sources: [
      sourceSpec("cards", () => readAllCardsForBackup()),
      sourceSpec("categories", async () => sortedCats),
      sourceSpec("sources", () => readAllSourcesForBackup()),
      sourceSpec("mindMaps", () => readAllMindMapsForBackup()),
      sourceSpec("knowledgeBaseArticles", () => readAllKbArticlesForBackup()),
      sourceSpec("diary", () => readDiary()),
      sourceSpec("calibrationLog", () => readCalibrationLog()),
      sourceSpec("latencyLog", () => readLatencyLog()),
      sourceSpec("slippageLog", () => readSlippageLog()),
      sourceSpec("activityLog", () => readActivityLog()),
      sourceSpec("disciplineLog", () => readAllDisciplineLogForBackup()),
      sourceSpec("pomodoroLog", () => readPomodoroLog()),
      sourceSpec("reviewLog", () => readReviewLog()),
      sourceSpec("mnemonics", () => readAllMnemonicsForBackup()),
      sourceSpec("majorSystem", () => readAllMajorSystemForBackup()),
      sourceSpec("mnemonicTestLog", () => readAllMnemonicTestLogForBackup()),
      sourceSpec("settings", () => readSettingsTableRaw()),
    ],
    onProgress: () => {},
  });
}

/** Assemble the v7 full-backup object (same fields as `streamBackup` output). */
export async function buildFullBackupPayload(options?: {
  srSettings?: SRSettings;
}): Promise<Record<string, unknown>> {
  const catRecords = await readAllCategoriesForBackup();
  const sortedCats = [...catRecords].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const localStorageData = await exportLegacyLocalStorageData();

  return {
    version: 7,
    type: "full",
    subcategories: deriveSubMap(sortedCats),
    srSettings: options?.srSettings ?? DEFAULT_SR_SETTINGS,
    localStorageData,
    cards: await readAllCardsForBackup(),
    categories: sortedCats,
    sources: await readAllSourcesForBackup(),
    mindMaps: await readAllMindMapsForBackup(),
    knowledgeBaseArticles: await readAllKbArticlesForBackup(),
    diary: await readDiary(),
    calibrationLog: await readCalibrationLog(),
    latencyLog: await readLatencyLog(),
    slippageLog: await readSlippageLog(),
    activityLog: await readActivityLog(),
    disciplineLog: await readAllDisciplineLogForBackup(),
    pomodoroLog: await readPomodoroLog(),
    reviewLog: await readReviewLog(),
    mnemonics: await readAllMnemonicsForBackup(),
    majorSystem: await readAllMajorSystemForBackup(),
    mnemonicTestLog: await readAllMnemonicTestLogForBackup(),
    settings: await readSettingsTableRaw(),
  };
}

export function parseBackupPayload(raw: unknown): ParsedBackup {
  const { raw: healed } = healBackupRaw(raw);
  const result = BackupSchema.safeParse(healed);
  if (!result.success) {
    const summary = result.error.issues
      .slice(0, 3)
      .map((iss) => `${iss.path.join(".")}: ${iss.message}`)
      .join("; ");
    throw new Error(`Backup parse failed: ${summary}`);
  }
  return migrateBackup(result.data);
}

async function blobToText(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") {
    return blob.text();
  }
  return new Response(blob).text();
}

export async function parseBackupBlob(blob: Blob): Promise<ParsedBackup> {
  const raw: unknown = JSON.parse(await blobToText(blob));
  return parseBackupPayload(raw);
}

/** Import parsed backup using the same cache commit path as `useCardImport`. */
export async function importParsedBackup(parsed: ParsedBackup): Promise<void> {
  const cacheSession = beginAllCachesWrite();
  let committed = false;
  try {
    const result = await applyImportAtomically({
      parsed,
      strategy: "overwrite",
      currentMap: {},
    });
    await commitAllCachesFromDb(cacheSession, {
      freshCategories: result.freshCategories,
      srSettings: result.srSettingsApplied,
      syncReviewLog: result.reviewLogApplied !== null,
      satellites: "import",
    });
    committed = true;
  } finally {
    if (!committed) {
      await abortAllCachesWrite(cacheSession);
    }
  }
}
