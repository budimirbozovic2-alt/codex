import { seedDefaultCategories } from "@/lib/db";
import { reviewLogRepository, settingsRepository } from "@/lib/repositories";
import type { CategoryRecord } from "@/lib/db-types";
import { listAllCards } from "@/lib/db/queries";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { splashProgress } from "./splash";
import { withTimeout } from "./withTimeout";

import { logger } from "@/lib/logger";

export interface InitialData {
  cards: Card[];
  catRecords: CategoryRecord[];
  log: ReviewLogEntry[];
  settings: SRSettings;
}

export async function loadInitialData(): Promise<InitialData> {
  // Initialize in-memory caches from IDB (replaces localStorage)
  splashProgress(15, "Inicijalizacija keša…");
  transition({ type: "LOAD_PROGRESS", pct: 15, label: "Inicijalizacija keša…" });
  if (import.meta.env.DEV) logger.log("[boot:diag] step 3: initCaches");
  const { initMetacognitiveCache } = await import("@/lib/metacognitive-storage");
  const { initPlannerCache } = await import("@/lib/planner-storage");
  const { initSubjectSettingsCache } = await import("@/lib/subject-settings");
  await withTimeout(
    Promise.all([
      initMetacognitiveCache().catch((e) => logger.warn("[silent]", e)),
      initPlannerCache().catch((e) => logger.warn("[silent]", e)),
      initSubjectSettingsCache().catch((e) => logger.warn("[silent]", e)),
    ]),
    3000, "cache init", undefined
  );

  splashProgress(25, "Učitavanje podataka…");
  transition({ type: "LOAD_PROGRESS", pct: 25, label: "Učitavanje podataka…" });
  if (import.meta.env.DEV) logger.log("[boot:diag] step 4: loading data (parallel)");
  markBootStep("cards:data-load-start");

  // B2: Parallelize all independent IDB loads
  const [cards, catRecords, log, settings] = await Promise.all([
    withTimeout(listAllCards(), 5000, "cards load", [] as Card[]),
    withTimeout(seedDefaultCategories(), 2500, "categories load", [] as CategoryRecord[]),
    withTimeout(reviewLogRepository.loadRecent(90), 2500, "review log load", [] as ReviewLogEntry[]),
    withTimeout(settingsRepository.load<SRSettings>("srSettings", DEFAULT_SR_SETTINGS), 2500, "settings load", DEFAULT_SR_SETTINGS),
  ]);

  // Legacy frequency-tag migracija je premještena u `runHeal` (Phase 2b).


  splashProgress(60, `${cards.length} kartica učitano`);
  transition({ type: "LOAD_PROGRESS", pct: 60, label: `${cards.length} kartica učitano` });
  if (import.meta.env.DEV) logger.log("[boot:diag] categories loaded:", catRecords.length, catRecords.map((r: CategoryRecord) => r.name));

  return { cards, catRecords, log, settings };
}
