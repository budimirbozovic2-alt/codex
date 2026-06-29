/**
 * Faza 0 — helpers for export → parse → import roundtrip contract tests.
 * Implementation lives in src/e2e/smoke-backup.ts (shared with Playwright smoke).
 */
export {
  buildFullBackupPayload,
  parseBackupPayload,
  importParsedBackup,
} from "@/e2e/smoke-backup";

import { streamBackup, sourceSpec } from "@/lib/backup/export-stream";
import { exportLegacyLocalStorageData } from "@/lib/backup/legacy-local-storage";
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
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import { parseBackupPayload } from "@/e2e/smoke-backup";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

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

export { importParsedBackup } from "@/e2e/smoke-backup";
