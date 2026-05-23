/**
 * Atomic backup-import orchestrator.
 *
 * Wraps every IDB write performed during a Restore in a *single* Dexie
 * `rw` transaction across all affected tables. If any step throws, the
 * IndexedDB state rolls back to the pre-import snapshot — no more
 * "half-replaced" databases where cards committed but sources didn't.
 *
 * The body itself stays minimal: this file owns the pre-tx pipeline
 * (merge cards, build remap, legacy-name resolve), the rw transaction
 * scope, and the post-tx snapshot. All actual table writes live in
 * sibling modules:
 *
 *   - `write-cards-tx.ts`       — cards bulkPut + orphan prune
 *   - `write-categories-tx.ts`  — categories + legacy subcategories map
 *   - `write-satellite-tx.ts`   — sources, mindMaps, KB, metacog logs
 *   - `import-remap.ts`         — pre-tx pure helpers
 *   - `import-types.ts`         — shared shapes
 */
import { db, idbLoadCategories, type CategoryRecord } from "@/lib/db";
import { DEFAULT_SR_SETTINGS, type SRSettings } from "@/lib/spaced-repetition";
import type { ReviewLogEntry } from "@/lib/storage";
import { resolveLegacyTaxonomyNames } from "@/lib/migrations/resolve-legacy-taxonomy";
import { yieldUI } from "@/lib/backup/yield-ui";
import { backupLog } from "@/lib/backup/backup-logger";
import { emitCategoriesUpdated } from "@/lib/repositories";

import type { ImportCtx, ImportTxResult, ImportStrategy } from "@/lib/backup/import-types";
import {
  isCategoryRecordArray,
  buildCategoryIdRemap,
  applyRemapToParsed,
} from "@/lib/backup/import-remap";
import { mergeCardsByStrategy, writeCardsTx } from "@/lib/backup/write-cards-tx";
import { writeCategoriesTx } from "@/lib/backup/write-categories-tx";
import { writeSatelliteTablesTx } from "@/lib/backup/write-satellite-tx";

// Re-exports preserved so external call sites
// (`useCardImport`, tests) keep working unchanged.
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

export async function applyImportAtomically(ctx: ImportCtx): Promise<ImportTxResult> {
  const { parsed, strategy, currentMap, onProgress } = ctx;
  const progress = onProgress ?? (() => { /* noop */ });

  backupLog.start("import", "atomic restore begin", {
    strategy,
    cards: parsed.cards.length,
    categories: parsed.categories.length,
    schemaVersion: (parsed as { version?: number }).version ?? null,
  });

  try {
    // ── 1. Pre-merge cards (in-memory only — IDB writes happen in tx below) ──
    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, currentMap, strategy);

    // ── 2. Pre-tx remap (Phase 2.1) ──
    // Read existing categories OUTSIDE the rw tx so we can compute the remap
    // before locking. The rw tx below re-asserts the final state.
    let freshCategories: CategoryRecord[] = await idbLoadCategories();
    if (parsed.categories.length > 0 && isCategoryRecordArray(parsed.categories)) {
      const remap = buildCategoryIdRemap(parsed.categories, freshCategories);
      await applyRemapToParsed(remap, parsed, merged, nextMap);
    }

    // ── 3. Legacy taxonomy resolve (names → UUIDs) — also pre-tx (pure) ──
    let legacyResolveReport: ImportTxResult["legacyResolveReport"] = null;
    try {
      legacyResolveReport = resolveLegacyTaxonomyNames(merged, freshCategories);
      for (const c of merged) nextMap[c.id] = c;
    } catch (err) {
      backupLog.warn(
        "import",
        "legacy taxonomy resolve failed",
        err instanceof Error ? err.message : String(err),
      );
    }

    await yieldUI();

    // Will be filled in after the transaction commits.
    let srSettingsApplied: SRSettings | null = null;
    let reviewLogApplied: ReviewLogEntry[] | null = null;

    // ── 4. SINGLE atomic transaction across every affected table ──
    const tables = [
      db.cards, db.categories, db.sources, db.mindMaps, db.knowledgeBaseArticles,
      db.reviewLog, db.diary, db.calibrationLog, db.latencyLog, db.slippageLog,
      db.activityLog, db.disciplineLog, db.pomodoroLog, db.mnemonics,
      db.majorSystem, db.mnemonicTestLog, db.settings,
    ];
    await db.transaction("rw", tables, async () => {
      progress(35, "Snimanje kategorija…");
      await writeCategoriesTx(parsed, strategy, freshCategories);

      progress(50, "Snimanje kartica…");
      await writeCardsTx(merged, strategy);

      // 4d. Review log overwrite.
      if (parsed.reviewLog.length > 0 && strategy === "overwrite") {
        progress(60, "Uvoz dnevnika ponavljanja…");
        const log = parsed.reviewLog as unknown as ReviewLogEntry[];
        reviewLogApplied = log;
        await db.reviewLog.clear();
        await db.reviewLog.bulkAdd(log);
        await yieldUI();
      }

      // 4e. SR settings (pure data — no IDB write here, applied post-tx via cb).
      if (parsed.srSettings && strategy === "overwrite") {
        srSettingsApplied = { ...DEFAULT_SR_SETTINGS, ...(parsed.srSettings as Partial<SRSettings>) };
      }

      await writeSatelliteTablesTx(parsed, strategy, progress);
    });

    // ── 5. Re-read final categories snapshot for AppContext ──
    freshCategories = await idbLoadCategories();

    // Phase 5A — broadcast so the categoryStateInvalidator (and any future
    // cross-tab listener) can refresh from the authoritative IDB snapshot.
    emitCategoriesUpdated({
      source: "backup-restore",
      categoryIds: freshCategories.map(c => c.id) as never,
    });

    backupLog.success("import", "atomic restore committed", {
      strategy,
      cards: merged.length,
      categories: freshCategories.length,
    });

    return {
      merged,
      nextMap,
      freshCategories,
      legacyResolveReport,
      srSettingsApplied,
      reviewLogApplied,
    };
  } catch (err) {
    backupLog.error("import", "atomic restore failed — rolled back", err);
    throw err;
  }
}
