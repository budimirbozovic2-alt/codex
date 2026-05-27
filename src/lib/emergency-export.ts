import { taskScheduler } from "@/lib/scheduler";

export async function performEmergencyExport(timeoutMs = 3000) {
  // PR-9 A1b P1.B — backup-readers seam (SQLite-primary where migrated).
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

    // Derive subcategories from CategoryRecords
    const subcategories: Record<string, string[]> = {};
    categories.forEach(r => {
      if (r.subcategories && r.subcategories.length > 0) {
        subcategories[r.name] = r.subcategories.map((s: { name: string } | string) => typeof s === "string" ? s : s.name);
      }
    });

    const data = {
      version: 5, type: "emergency-backup",
      timestamp: new Date().toISOString(),
      cards, categories, subcategories, sources, reviewLog,
      mindMaps, diary, calibrationLog, latencyLog,
      slippageLog, activityLog, disciplineLog, pomodoroLog,
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
