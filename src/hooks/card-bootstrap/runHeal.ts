/**
 * PR-2 — Phase 2: data healing. Best-effort, idempotent, NIKADA ne throw-uje
 * na gore. Pojedinačni step koji padne emituje `HEAL_STEP_FAIL` i nastavlja
 * sa sljedećim — boot uvijek napreduje, degradacija je vidljiva preko
 * `useBootState().skipped[]`.
 */
import type { CategoryRecord } from "@/lib/db-types";
import { type Card, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "@/lib/boot";
import { logger } from "@/lib/logger";
import { bulkPutCardsDirect } from "@/lib/db/queries";

export interface HealInput {
  cards: Card[];
  catRecords: CategoryRecord[];
  /**
   * When true, suppress boot state machine transitions (HEAL_START/PROGRESS/DONE/STEP_FAIL).
   * Used by deferred boot path where heal runs AFTER `READY` and must not
   * regress the splash state. Trace markers are still emitted.
   */
  silent?: boolean;
}

export interface HealResult {
  finalRecords: CategoryRecord[];
  skippedSteps: string[];
  /** Mutated cards (frequency-tag migration). Empty if no changes. */
  mutatedCards: Card[];
}

export async function runHeal({ cards, catRecords, silent = false }: HealInput): Promise<HealResult> {
  markBootStep("cards:heal-start");
  if (!silent) transition({ type: "HEAL_START" });
  const skipped: string[] = [];


  // ─── Step 1: card taxonomy heal (stale subcategoryId/chapterId references) ───
  try {
    if (!silent) transition({ type: "HEAL_PROGRESS", pct: 20, label: "Heal taksonomije…" });
    const { healCardTaxonomy } = await import("@/lib/migrations/heal-card-taxonomy");
    const report = await healCardTaxonomy();
    if (report && !report.skipped && (report.staleSubcategoryReset + report.staleChapterReset + report.mismatchChapterReset) > 0) {
      logger.info("[boot] taxonomy healed", report);
    }
  } catch (e) {
    logger.warn("[boot] heal step 'taxonomy' failed, skipping", e);
    if (!silent) transition({ type: "HEAL_STEP_FAIL", step: "taxonomy" });
    skipped.push("taxonomy");
  }

  // ─── Step 2: legacy frequency tag migration ───
  const mutatedCards: Card[] = [];
  try {
    if (!silent) transition({ type: "HEAL_PROGRESS", pct: 45, label: "Frequency tag migracija…" });
    const { LEGACY_FREQUENT_TAG, LEGACY_RARE_TAG, stripLegacyFrequencyTags } = await import("@/lib/sr/frequency");
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
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
      cards[i] = next;
      mutatedCards.push(next);
    }
    if (mutatedCards.length > 0) {
      // PR-E3: direct SQLite write — awaits persist-queue flush internally,
      // then emits notifyCardsChanged so TanStack invalidates.
      await bulkPutCardsDirect(mutatedCards);
    }

  } catch (e) {
    logger.warn("[boot] heal step 'frequencyTag' failed, skipping", e);
    if (!silent) transition({ type: "HEAL_STEP_FAIL", step: "frequencyTag" });
    skipped.push("frequencyTag");
  }

  // ─── Done ───
  if (!silent) transition({ type: "HEAL_PROGRESS", pct: 100, label: "Heal završen" });
  markBootStep(
    skipped.length > 0 ? "boot:heal-degraded" : "cards:heal-done",
    skipped.length > 0 ? skipped.join(",") : undefined,
  );
  if (!silent) transition({ type: "HEAL_DONE" });

  // Silence unused import warning for DEFAULT_SR_SETTINGS in some envs (no-op).
  void DEFAULT_SR_SETTINGS;

  return { finalRecords: catRecords, skippedSteps: skipped, mutatedCards };
}
