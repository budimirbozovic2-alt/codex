import { taskScheduler } from "@/lib/scheduler";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";
import type { CategoryRecord } from "@/lib/db-types";

function deriveSubMap(catRecords: CategoryRecord[]): Record<string, string[]> {
  const subMap: Record<string, string[]> = {};
  for (const r of catRecords) {
    if (r.subcategories.length > 0) {
      subMap[r.name] = r.subcategories.map((s) => s.name);
    }
  }
  return subMap;
}

export async function performEmergencyExport(timeoutMs = 3000) {
  const {
    readAllCardsForBackup,
    readAllCategoriesForBackup,
    readAllSourcesForBackup,
    readAllMindMapsForBackup,
    readAllDisciplineLogForBackup,
    readReviewLog,
    readDiary,
    readCalibrationLog,
    readLatencyLog,
    readSlippageLog,
    readActivityLog,
    readPomodoroLog,
  } = await import("@/lib/db/queries");

  const exportTask = async () => {
    const [
      cards, categories, sources, reviewLog, mindMaps, diary,
      calibrationLog, latencyLog, slippageLog, activityLog, disciplineLog, pomodoroLog,
    ] = await Promise.all([
      readAllCardsForBackup(),
      readAllCategoriesForBackup(),
      readAllSourcesForBackup(),
      readReviewLog(),
      readAllMindMapsForBackup(),
      readDiary(),
      readCalibrationLog(),
      readLatencyLog(),
      readSlippageLog(),
      readActivityLog(),
      readAllDisciplineLogForBackup(),
      readPomodoroLog(),
    ]);

    const data = {
      version: BACKUP_SCHEMA_VERSION,
      type: "full" as const,
      cards,
      categories,
      subcategories: deriveSubMap(categories),
      sources,
      reviewLog,
      mindMaps,
      diary,
      calibrationLog,
      latencyLog,
      slippageLog,
      activityLog,
      disciplineLog,
      pomodoroLog,
      knowledgeBaseArticles: [],
      mnemonics: [],
      majorSystem: [],
      mnemonicTestLog: [],
      settings: [],
    };
    return JSON.stringify(data);
  };

  const timeout = new Promise<never>((_, reject) => {
    taskScheduler.setTimeout(
      () => reject(new Error("Database locked or too slow")),
      timeoutMs,
      { label: "emergency-export:timeout", priority: "high" },
    );
  });

  return Promise.race([exportTask(), timeout]);
}
