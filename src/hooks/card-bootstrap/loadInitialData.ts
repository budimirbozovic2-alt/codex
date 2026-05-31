import { seedDefaultCategories } from "@/lib/db-seed";
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
  /** Always empty in Phase 1 — cards are loaded off the critical path via `loadCardsDeferred`. */
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
  const { initPlannerCache } = await import("@/domains/planner");
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
  if (import.meta.env.DEV) logger.log("[boot:diag] step 4: loading data (parallel, cards deferred)");
  markBootStep("cards:data-load-start");

  // Phase 1: cards are NO LONGER on the boot critical path — they stream in
  // post-READY via `loadCardsDeferred` scheduled by `useCardBootstrap`.
  const [catRecords, log, settings] = await Promise.all([
    withTimeout(seedDefaultCategories(), 2500, "categories load", [] as CategoryRecord[]),
    withTimeout(reviewLogRepository.loadRecent(90), 2500, "review log load", [] as ReviewLogEntry[]),
    withTimeout(settingsRepository.load<SRSettings>("srSettings", DEFAULT_SR_SETTINGS), 2500, "settings load", DEFAULT_SR_SETTINGS),
  ]);

  splashProgress(60, "Učitavanje gotovo");
  transition({ type: "LOAD_PROGRESS", pct: 60, label: "Učitavanje gotovo" });
  if (import.meta.env.DEV) logger.log("[boot:diag] categories loaded:", catRecords.length, catRecords.map((r: CategoryRecord) => r.name));

  return { cards: [], catRecords, log, settings };
}

/**
 * Phase 1 — cards load deferred off the boot critical path. Called from
 * `useCardBootstrap` via `taskScheduler.idle` after READY transition.
 * Wider timeout (8s) since this no longer blocks UI.
 */
export async function loadCardsDeferred(): Promise<Card[]> {
  return withTimeout(listAllCards(), 8000, "cards load (deferred)", [] as Card[]);
}

