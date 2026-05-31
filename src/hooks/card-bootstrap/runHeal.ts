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
import { withTimeout } from "./withTimeout";
import { normalizeCategoryShapes } from "./normalizeCategoryShapes";
import * as cardMapWrites from "@/domains/cards";
import { categoryRepository } from "@/lib/repositories";

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
    const report = await withTimeout(healCardTaxonomy(), 3000, "taxonomy heal", null);
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
      // Audit v2 / Wave B.3: previously fire-and-forget. `bulkPut` enqueues
      // a persist op (`schedulePersist`) but doesn't flush, so if Electron's
      // `beforeunload` fired immediately after heal the frequency-tag
      // migration was lost. Sync enqueue then explicitly await flush so the
      // migration is durable before this branch returns.
      cardMapWrites.bulkPut(mutatedCards);
      const { persistQueue } = await import("@/lib/persist-queue");
      await persistQueue.flush();
    }

  } catch (e) {
    logger.warn("[boot] heal step 'frequencyTag' failed, skipping", e);
    if (!silent) transition({ type: "HEAL_STEP_FAIL", step: "frequencyTag" });
    skipped.push("frequencyTag");
  }

  // ─── Step 3: category shape normalization (legacy → SubcategoryNode, phantom prune) ───
  let finalRecords = catRecords;
  try {
    if (!silent) transition({ type: "HEAL_PROGRESS", pct: 75, label: "Normalizacija kategorija…" });
    const { records, needsPersist } = normalizeCategoryShapes(cards, catRecords);
    finalRecords = records;

    if (needsPersist) {
      try {
        // PR-9 A1c-3: persist normalized category records through the
        // categoryRepository SSOT (Zustand store + idbSaveCategories) instead
        // of per-row Dexie updates. The updater replaces matching ids and
        // keeps untouched rows untouched.
        const byId = new Map(records.map((r) => [r.id, r]));
        await categoryRepository.commit(
          (prev) => prev.map((r) => byId.get(r.id) ?? r),
          "heal:categoryShapes",
        );
      } catch (persistErr) {
        // Persist fail je sub-step koji ne lomi boot — koristimo records u memoriji.
        logger.warn("[boot] heal step 'categoryShapes' persist failed (in-memory only)", persistErr);
        if (!silent) transition({ type: "HEAL_STEP_FAIL", step: "categoryShapesPersist" });
        skipped.push("categoryShapesPersist");
      }
    }
  } catch (e) {
    logger.warn("[boot] heal step 'categoryShapes' failed, skipping", e);
    if (!silent) transition({ type: "HEAL_STEP_FAIL", step: "categoryShapes" });
    skipped.push("categoryShapes");
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

  return { finalRecords, skippedSteps: skipped, mutatedCards };
}
