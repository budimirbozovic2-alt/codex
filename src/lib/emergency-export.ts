import { taskScheduler } from "@/lib/scheduler";

export async function performEmergencyExport(timeoutMs = 3000) {
  const { db } = await import("@/lib/db");

  const exportTask = async () => {
    const [
      cards, categories, sources, reviewLog, mindMaps, diary,
      calibrationLog, latencyLog, slippageLog, activityLog, disciplineLog, pomodoroLog,
    ] = await Promise.all([
      db.cards.toArray(), db.categories.toArray(), db.sources.toArray(),
      db.reviewLog.toArray(), db.mindMaps.toArray(), db.diary.toArray(),
      db.calibrationLog.toArray(), db.latencyLog.toArray(), db.slippageLog.toArray(),
      db.activityLog.toArray(), db.disciplineLog.toArray(), db.pomodoroLog.toArray(),
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

