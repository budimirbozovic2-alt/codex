/**
 * Build a v7 backup snapshot from the active SQLite executor.
 * Used by auto-backup and export.
 */
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import { runWithSqlExecutor } from "@/lib/persistence/sqlite/client";

export async function buildBackupSnapshot(
  exec: SqlExecutor,
): Promise<ParsedBackup> {
  return runWithSqlExecutor(exec, async () => {
    const {
      getSetting,
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
    } = await import("@/lib/db/queries");
    const { exportLegacyLocalStorageData } = await import(
      "./legacy-local-storage"
    );

    const [
      cards,
      categories,
      reviewLog,
      srSettingsValue,
      sources,
      mindMaps,
      knowledgeBaseArticles,
      mnemonics,
      majorSystem,
      mnemonicTestLog,
      diary,
      calibrationLog,
      latencyLog,
      slippageLog,
      activityLog,
      disciplineLog,
      pomodoroLog,
    ] = await Promise.all([
      readAllCardsForBackup(),
      readAllCategoriesForBackup(),
      readReviewLog(),
      getSetting<unknown>("srSettings"),
      readAllSourcesForBackup(),
      readAllMindMapsForBackup(),
      readAllKbArticlesForBackup(),
      readAllMnemonicsForBackup(),
      readAllMajorSystemForBackup(),
      readAllMnemonicTestLogForBackup(),
      readDiary(),
      readCalibrationLog(),
      readLatencyLog(),
      readSlippageLog(),
      readActivityLog(),
      readAllDisciplineLogForBackup(),
      readPomodoroLog(),
    ]);

    const localStorageData = await exportLegacyLocalStorageData();

    return {
      version: 7,
      type: "full",
      cards,
      categories,
      reviewLog,
      srSettings: srSettingsValue as ParsedBackup["srSettings"],
      sources,
      mindMaps,
      knowledgeBaseArticles,
      mnemonics,
      majorSystem,
      mnemonicTestLog,
      diary,
      calibrationLog,
      latencyLog,
      slippageLog,
      activityLog,
      disciplineLog,
      pomodoroLog,
      settings: [],
      localStorageData,
    };
  });
}
