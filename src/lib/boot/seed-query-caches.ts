/**
 * Authoritative TanStack seed for boot — categories, cards, review, SR settings.
 * TD-ARCH-6: single entry point replacing scattered boot-dag cache steps.
 */
import type { SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/types/logs";
import { markBootStep } from "@/lib/boot-trace";
import { transition } from "./bootStateMachine";
import {
  REVIEW_LOG_BOOT_DAYS,
  commitCardsWriteFromDb,
  commitCategoriesWriteFromDb,
  ensureCardsBootCache,
  ensureCategoriesBootCache,
  getCardsCacheWriteGeneration,
  getCategoriesCacheWriteGeneration,
  seedReviewLogCache,
  seedSrSettingsCache,
} from "@/lib/query/cache-coordinator";

export interface BootQuerySeedInput {
  log: readonly ReviewLogEntry[];
  settings: SRSettings;
}

/** Seed all core TanStack query caches from SQLite (boot critical path). */
export async function seedAllQueryCaches(
  signal: AbortSignal,
  initial: BootQuerySeedInput,
): Promise<number> {
  seedReviewLogCache([...initial.log], REVIEW_LOG_BOOT_DAYS);
  seedSrSettingsCache(initial.settings);

  transition({ type: "LOAD_PROGRESS", pct: 40, label: "Učitavanje kategorija…" });

  const catWriteGen = getCategoriesCacheWriteGeneration();
  let catCount = await ensureCategoriesBootCache(catWriteGen, signal);
  if (signal.aborted) return -1;
  if (catCount < 0) {
    catCount = await commitCategoriesWriteFromDb(getCategoriesCacheWriteGeneration());
  }

  transition({ type: "LOAD_PROGRESS", pct: 70, label: "Učitavanje kartica…" });
  markBootStep("cards:cache-ensure-start");

  const writeGenAtStart = getCardsCacheWriteGeneration();
  let cardCount = await ensureCardsBootCache(writeGenAtStart, signal);
  if (signal.aborted) return -1;

  if (cardCount < 0) {
    const retryGen = getCardsCacheWriteGeneration();
    cardCount = await ensureCardsBootCache(retryGen, signal);
    if (cardCount < 0 && !signal.aborted) {
      cardCount = await commitCardsWriteFromDb(retryGen);
    }
  }

  markBootStep("cards:data-load-done", `${cardCount} cards`);
  return cardCount;
}
