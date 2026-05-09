import {
  idbLoadCards,
  idbLoadRecentReviewLog,
  idbLoadSettings,
  seedDefaultCategories,
  db,
  type CategoryRecord,
} from "@/lib/db";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { markBootStep } from "@/lib/boot-trace";
import { splashProgress } from "./splash";
import { withTimeout } from "./withTimeout";

export interface InitialData {
  cards: Card[];
  catRecords: CategoryRecord[];
  log: ReviewLogEntry[];
  settings: SRSettings;
}

export async function loadInitialData(): Promise<InitialData> {
  // Initialize in-memory caches from IDB (replaces localStorage)
  splashProgress(15, "Inicijalizacija keša…");
  if (import.meta.env.DEV) console.log("[boot:diag] step 3: initCaches");
  const { initMetacognitiveCache } = await import("@/lib/metacognitive-storage");
  const { initPlannerCache } = await import("@/lib/planner-storage");
  const { initSubjectSettingsCache } = await import("@/lib/subject-settings");
  await withTimeout(
    Promise.all([
      initMetacognitiveCache().catch((e) => console.warn("[silent]", e)),
      initPlannerCache().catch((e) => console.warn("[silent]", e)),
      initSubjectSettingsCache().catch((e) => console.warn("[silent]", e)),
    ]),
    3000, "cache init", undefined
  );

  splashProgress(25, "Učitavanje podataka…");
  if (import.meta.env.DEV) console.log("[boot:diag] step 4: loading data (parallel)");
  markBootStep("cards:data-load-start");

  // B2: Parallelize all independent IDB loads
  const [cards, catRecords, log, settings] = await Promise.all([
    withTimeout(idbLoadCards(), 5000, "cards load", [] as Card[]),
    withTimeout(seedDefaultCategories(), 2500, "categories load", [] as CategoryRecord[]),
    withTimeout(idbLoadRecentReviewLog(90), 2500, "review log load", [] as ReviewLogEntry[]),
    withTimeout(idbLoadSettings<SRSettings>("srSettings", DEFAULT_SR_SETTINGS), 2500, "settings load", DEFAULT_SR_SETTINGS),
  ]);

  // One-time migration: legacy tags[] ("često-na-ispitu" / "rijetko-na-ispitu")
  // → Card.frequencyTag (triple system SSOT). Idempotent.
  try {
    const { LEGACY_FREQUENT_TAG, LEGACY_RARE_TAG, stripLegacyFrequencyTags } = await import("@/lib/sr/frequency");
    const migrated: Card[] = [];
    for (const card of cards) {
      const tags = card.tags;
      if (!tags || tags.length === 0) continue;
      const hadFreq = tags.includes(LEGACY_FREQUENT_TAG);
      const hadRare = tags.includes(LEGACY_RARE_TAG);
      if (!hadFreq && !hadRare) continue;
      const cleaned = stripLegacyFrequencyTags(tags);
      const next: Card = {
        ...card,
        tags: cleaned,
        frequencyTag: card.frequencyTag ?? (hadFreq ? "često" : "rijetko"),
      };
      migrated.push(next);
      const idx = cards.indexOf(card);
      if (idx >= 0) cards[idx] = next;
    }
    if (migrated.length > 0 && db) {
      db.cards.bulkPut(migrated).catch((e: unknown) =>
        console.warn("[boot] frequency tag migration persist failed", e),
      );
      if (import.meta.env.DEV) console.info(`[boot] migrated ${migrated.length} cards: legacy tags → frequencyTag`);
    }
  } catch (e) { console.warn("[boot] frequency tag migration skipped", e); }

  splashProgress(60, `${cards.length} kartica učitano`);
  if (import.meta.env.DEV) console.log("[boot:diag] categories loaded:", catRecords.length, catRecords.map((r: CategoryRecord) => r.name));

  return { cards, catRecords, log, settings };
}
