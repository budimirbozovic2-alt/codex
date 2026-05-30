/**
 * Atomic backup-import orchestrator — PR-9 A1c-4 F1.
 *
 * Single `SqlExecutor.transaction` wraps every table write (categories →
 * cards → sources → mindMaps → KB → mnemonics → majorSystem → kv → 7 log
 * tables → disciplineLog → mnemonicTestLog). True SQLite ACID across the
 * entire restore — no more Dexie `db.transaction("rw", …)` and no more
 * post-tx Dexie categories mirror (F1 cut-over).
 */
import type { CategoryRecord } from "@/lib/db-types";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { resolveLegacyTaxonomyNames } from "@/lib/migrations/resolve-legacy-taxonomy";
import { yieldUI } from "@/lib/backup/yield-ui";
import { backupLog } from "@/lib/backup/backup-logger";
import { categoryRepository } from "@/lib/repositories";
import { readAllCategoriesForBackup } from "@/lib/db/queries";
import { getOpfsSqliteExecutor } from "@/lib/persistence/sqlite/client";
import { assertDesktop, isElectron } from "@/lib/electron-integration";

import type { ImportCtx, ImportTxResult, ImportStrategy } from "@/lib/backup/import-types";
import {
  isCategoryRecordArray,
  buildCategoryIdRemap,
  applyRemapToParsed,
} from "@/lib/backup/import-remap";
import {
  buildTaxonomyRemap,
  applyTaxonomyRemap,
  canMergeTaxonomy,
  type TaxonomyRemap,
} from "@/lib/backup/taxonomy-merge";
import { mergeCardsByStrategy, writeCardsTx } from "@/lib/backup/write-cards-tx";
import { writeCategoriesTx } from "@/lib/backup/write-categories-tx";
import { writeSatelliteTablesTx } from "@/lib/backup/write-satellite-tx";

// Re-exports preserved so external call sites (useCardImport, tests) keep
// compiling unchanged.
export type { ImportStrategy, ImportTxResult, ImportCtx } from "@/lib/backup/import-types";
export { mergeCardsByStrategy, writeCardsTx } from "@/lib/backup/write-cards-tx";
export { writeCategoriesTx } from "@/lib/backup/write-categories-tx";
export { writeSatelliteTablesTx } from "@/lib/backup/write-satellite-tx";
export {
  isCategoryRecordArray,
  buildCategoryIdRemap,
  applyRemapToParsed,
  pruneOrphans,
} from "@/lib/backup/import-remap";
export {
  buildTaxonomyRemap,
  applyTaxonomyRemap,
  canMergeTaxonomy,
} from "@/lib/backup/taxonomy-merge";




export async function applyImportAtomically(ctx: ImportCtx): Promise<ImportTxResult> {
  const { parsed, strategy, currentMap, onProgress } = ctx;
  const progress = onProgress ?? (() => { /* noop */ });

  backupLog.start("import", "atomic restore begin", {
    strategy,
    cards: parsed.cards.length,
    categories: parsed.categories.length,
    schemaVersion: (parsed as { version?: number }).version ?? null,
  });

  // Fail fast on web/dev — Pure Desktop policy.
  assertDesktop();
  const exec = await getOpfsSqliteExecutor();

  try {
    // ── 1. Pre-merge cards (pure, in-memory only) ──
    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, currentMap, strategy);

    // ── 2. Pre-tx FULL taxonomy remap (cat + sub + chap) + merge. The new
    //       `buildTaxonomyRemap` also adopts novel backup sub/chapters into
    //       matched existing categories, so card.subcategoryId / chapterId
    //       UUIDs survive the import instead of being wiped as orphans.
    const freshCategories: CategoryRecord[] = await readAllCategoriesForBackup();
    let taxonomy: TaxonomyRemap | null = null;
    if (canMergeTaxonomy(parsed) && isCategoryRecordArray(parsed.categories)) {
      taxonomy = buildTaxonomyRemap(parsed.categories, freshCategories, strategy);
      await applyTaxonomyRemap(taxonomy, parsed, merged, nextMap);
      backupLog.success("import", "taxonomy remap built", {
        catRemaps: taxonomy.categoryRemap.size,
        subRemaps: taxonomy.subcategoryRemap.size,
        chapRemaps: taxonomy.chapterRemap.size,
        toWrite: taxonomy.categoriesToWrite.length,
        finalCats: taxonomy.mergedCategories.length,
      });
    }

    // ── 3. Legacy taxonomy resolve (names → UUIDs) — pre-tx, pure.
    //       Runs against the MERGED category tree so adopted nodes are
    //       reachable when a legacy backup carries name-strings instead of
    //       UUIDs in card.subcategoryId / chapterId.
    const resolveAgainst = taxonomy?.mergedCategories ?? freshCategories;
    let legacyResolveReport: ImportTxResult["legacyResolveReport"] = null;
    try {
      legacyResolveReport = resolveLegacyTaxonomyNames(merged, resolveAgainst);
      for (const c of merged) nextMap[c.id] = c;
    } catch (err) {
      backupLog.warn(
        "import",
        "legacy taxonomy resolve failed",
        err instanceof Error ? err.message : String(err),
      );
    }

    await yieldUI();

    let srSettingsApplied: SRSettings | null = null;
    let reviewLogApplied: ReviewLogEntry[] | null = null;
    let finalCategories: CategoryRecord[] = freshCategories;

    // ── 4. SINGLE SQLite ACID transaction across every affected table ──
    await exec.transaction(async (tx) => {
      progress(35, "Snimanje kategorija…");
      finalCategories = await writeCategoriesTx(tx, parsed, strategy, freshCategories, taxonomy);


      progress(50, "Snimanje kartica…");
      await writeCardsTx(tx, merged, strategy);

      // SR settings + review log are surfaced post-tx via callbacks; the
      // tx path persists reviewLog via writeSatelliteTablesTx below.
      if (parsed.reviewLog.length > 0 && strategy === "overwrite") {
        reviewLogApplied = parsed.reviewLog as unknown as ReviewLogEntry[];
      }
      if (parsed.srSettings && strategy === "overwrite") {
        srSettingsApplied = {
          ...DEFAULT_SR_SETTINGS,
          ...(parsed.srSettings as Partial<SRSettings>),
        };
      }

      await writeSatelliteTablesTx(tx, parsed, strategy, progress);
    });

    // ── 5. Push freshly restored categories into the SSOT store. ──
    //       SQLite is now the durable copy (no Dexie mirror after A1c-4 F1).
    categoryRepository.replaceAll(finalCategories);

    backupLog.success("import", "atomic restore committed", {
      strategy,
      cards: merged.length,
      categories: finalCategories.length,
    });

    return {
      merged,
      nextMap,
      freshCategories: finalCategories,
      legacyResolveReport,
      srSettingsApplied,
      reviewLogApplied,
    };
  } catch (err) {
    backupLog.error("import", "atomic restore failed — rolled back", err);
    throw err;
  }
}
