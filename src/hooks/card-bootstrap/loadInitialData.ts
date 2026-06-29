import { seedDefaultCategories } from "@/lib/db-seed";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";
import type { CategoryRecord } from "@/lib/db-types";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { listAllCards } from "@/lib/db/queries";
import { logger } from "@/lib/logger";

export interface InitialData {
  /** Legacy field — cards hydrate via `seedAllQueryCaches`. */
  cards: Card[];
  catRecords: CategoryRecord[];
  log: ReviewLogEntry[];
  settings: SRSettings;
}

/** Satellite caches + category/review/settings load (before TanStack seed). */
export async function loadInitialData(): Promise<InitialData> {
  transition({ type: "LOAD_PROGRESS", pct: 15, label: "Inicijalizacija keša…" });
  if (import.meta.env.DEV) logger.log("[boot:diag] init satellite caches");

  const [
    { initMetacognitiveCache },
    { initPlannerCache },
    { initSubjectSettingsCache },
  ] = await Promise.all([
    import("@/domains/metacognition/metacognitive-storage"),
    import("@/domains/planner"),
    import("@/domains/subjects/subject-settings"),
  ]);

  await Promise.all([
    initMetacognitiveCache(),
    initPlannerCache(),
    initSubjectSettingsCache(),
    import("@/lib/app-settings").then((m) => m.initAppSettingsCache()),
    import("@/lib/query/prefs-cache-coordinator").then((m) => m.initPrefsQueryCache()),
    import("@/lib/backup/legacy-local-storage").then((m) =>
      m.migrateBrowserLocalStorageToSqlite(),
    ),
  ]);

  transition({ type: "LOAD_PROGRESS", pct: 25, label: "Učitavanje podataka…" });
  markBootStep("cards:data-load-start");

  const [catRecords, log, settings] = await Promise.all([
    seedDefaultCategories(),
    reviewLogRepository.loadRecent(90),
    settingsRepository.load<SRSettings>("srSettings", DEFAULT_SR_SETTINGS),
  ]);

  transition({ type: "LOAD_PROGRESS", pct: 60, label: "Učitavanje gotovo" });
  if (import.meta.env.DEV) {
    logger.log(
      "[boot:diag] categories loaded:",
      catRecords.length,
      catRecords.map((r: CategoryRecord) => r.name),
    );
  }

  return { cards: [], catRecords, log, settings };
}

/** Post-READY deferred card load — failures propagate to caller. */
export async function loadCardsDeferred(): Promise<Card[]> {
  return listAllCards();
}
