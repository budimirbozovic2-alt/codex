import {
  listAllCards,
} from "@/lib/db/queries";

import { logger } from "@/lib/logger";

const LEGACY_FLAG_KEY = "taxonomy-healed-v1";
const MIGRATION_FLAG_KEY = "card-taxonomy-heal-v1";

export interface HealReport {
  scanned: number;
  staleSubcategoryReset: number;
  staleChapterReset: number;
  mismatchChapterReset: number;
  skipped: boolean;
}

/**
 * Manual / health-monitor entry point for card taxonomy heal.
 * Normal boot path runs `migrateCardTaxonomyReferences` during schema v12.
 */
export async function healCardTaxonomy(force = false): Promise<HealReport> {
  const empty: HealReport = {
    scanned: 0,
    staleSubcategoryReset: 0,
    staleChapterReset: 0,
    mismatchChapterReset: 0,
    skipped: false,
  };

  if (
    !force &&
    typeof localStorage !== "undefined" &&
    localStorage.getItem(LEGACY_FLAG_KEY) === "1"
  ) {
    return { ...empty, skipped: true };
  }

  try {
    const { requireSqlExecutor } = await import(
      "@/lib/db/queries/_shared/require-sql-executor"
    );
    const { migrateCardTaxonomyReferences } = await import(
      "@/lib/persistence/sqlite/boot-heal-migration"
    );
    const exec = await requireSqlExecutor("heal-card-taxonomy");

    if (force) {
      await exec.run("DELETE FROM kv WHERE key = ?", [MIGRATION_FLAG_KEY]);
    } else {
      const flagged = await exec.all<{ value: string }>(
        "SELECT value FROM kv WHERE key = ? LIMIT 1",
        [MIGRATION_FLAG_KEY],
      );
      if (flagged[0]?.value === "1") {
        return { ...empty, skipped: true };
      }
    }

    const cardsBefore = await listAllCards();
    const { patched } = await migrateCardTaxonomyReferences(exec);

    if (patched > 0) {
      const { runBulkCardsWrite } = await import(
        "@/lib/query/all-caches-coordinator"
      );
      await runBulkCardsWrite(async () => undefined);
    }

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LEGACY_FLAG_KEY, "1");
    }

    return {
      scanned: cardsBefore.length,
      staleSubcategoryReset: patched,
      staleChapterReset: 0,
      mismatchChapterReset: 0,
      skipped: patched === 0,
    };
  } catch (err) {
    logger.error("[heal-card-taxonomy] failed", err);
    return empty;
  }
}
