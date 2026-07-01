/**
 * Backup export/import helpers for E2E smoke (same path as production import).
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
  abortWriteSession,
  beginWriteSession,
  commitWriteSessionFromDb,
} from "@/lib/query/write-session";

function deriveSubMap(catRecords: CategoryRecord[]): Record<string, string[]> {
  const subMap: Record<string, string[]> = {};
  for (const r of catRecords) {
    if (r.subcategories.length > 0) {
      subMap[r.name] = r.subcategories.map((s) => s.name);
    }
  }
  return subMap;
}

/** Assemble a v7 full-backup object from current SQLite rows. */
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

/** Import parsed backup via unified write session (same as `useCardImport`). */
export async function importParsedBackup(parsed: ParsedBackup): Promise<void> {
  const cacheSession = beginWriteSession();
  let committed = false;
  try {
    const result = await applyImportAtomically({
      parsed,
      strategy: "overwrite",
      currentMap: {},
    });
    await commitWriteSessionFromDb(cacheSession, {
      freshCategories: result.freshCategories,
      srSettings: result.srSettingsApplied,
      syncReviewLog: result.reviewLogApplied !== null,
      satellites: "import",
    });
    committed = true;
  } finally {
    if (!committed) {
      await abortWriteSession(cacheSession);
    }
  }
}

/** Export → parse → import roundtrip smoke (returns card count after import). */
export async function runBackupSmokeRoundtrip(): Promise<{
  cardCountBefore: number;
  cardCountAfter: number;
}> {
  const payload = await buildFullBackupPayload();
  const cardCountBefore = Array.isArray(payload.cards) ? payload.cards.length : 0;
  const parsed = parseBackupPayload(payload);
  await importParsedBackup(parsed);
  const afterPayload = await buildFullBackupPayload();
  const cardCountAfter = Array.isArray(afterPayload.cards)
    ? afterPayload.cards.length
    : 0;
  return { cardCountBefore, cardCountAfter };
}
