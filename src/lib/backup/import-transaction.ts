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
import { assertDesktop } from "@/lib/electron-integration";

import type { ImportCtx, ImportTxResult } from "@/lib/backup/import-types";
import {
  isCategoryRecordArray,
  buildCategoryIdRemap,
  applyRemapToParsedV2,
  pruneOrphans,
} from "@/lib/backup/import-remap";
import { mergeCardsByStrategy, writeCardsTx } from "@/lib/backup/write-cards-tx";
import { writeCategoriesTx } from "@/lib/backup/write-categories-tx";
import { writeSatelliteTablesTx, writeSourcesTx } from "@/lib/backup/write-satellite-tx";

// Re-exports preserved so external call sites (useCardImport, tests) keep
// compiling unchanged.
export type { ImportStrategy, ImportTxResult, ImportCtx } from "@/lib/backup/import-types";
export { mergeCardsByStrategy, writeCardsTx } from "@/lib/backup/write-cards-tx";
export { writeCategoriesTx } from "@/lib/backup/write-categories-tx";
export { writeSatelliteTablesTx, writeSourcesTx } from "@/lib/backup/write-satellite-tx";
export {
  isCategoryRecordArray,
  buildCategoryIdRemap,
  applyRemapToParsed,
  applyRemapToParsedV2,
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

  // Fail fast on web/dev — Pure Desktop policy.
  assertDesktop();
  const exec = await getOpfsSqliteExecutor();

  try {
    // ── 1. Pre-tx remap (read existing categories OUTSIDE the tx) ──
    //
    // A2 fix: remap MUST run BEFORE `mergeCardsByStrategy`. Previously the
    // remap ran post-merge against the `merged` array AND mutated the
    // caller-owned `nextMap` (== { ...currentMap }) — silent state
    // corruption for non-overwrite imports. `applyRemapToParsedV2` walks
    // `parsed.cards` directly and touches no caller-owned map.
    const freshCategories: CategoryRecord[] = await readAllCategoriesForBackup();
    if (parsed.categories.length > 0 && isCategoryRecordArray(parsed.categories)) {
      const remap = buildCategoryIdRemap(parsed.categories, freshCategories);
      await applyRemapToParsedV2(remap, parsed);
    }

    // ── 2. Pre-merge cards (pure, in-memory only) ──
    const { merged, nextMap } = mergeCardsByStrategy(parsed.cards, currentMap, strategy);

    // ── 3. Legacy taxonomy resolve (names → UUIDs) — pre-tx, pure ──
    // Audit v2 / Wave A.5: previously a `try { … } catch { warn }` block.
    // A failure inside `resolveLegacyTaxonomyNames` (which mutates `merged`
    // in place) would still let the merged cards through to the ACID write
    // with stale/null FK refs. The FK constraint may or may not catch
    // it depending on the row data, and the user saw "Restore uspešan".
    // We now let the exception propagate so the outer caller rolls back the
    // transaction and surfaces the failure.
    let legacyResolveReport: ImportTxResult["legacyResolveReport"] = null;
    legacyResolveReport = resolveLegacyTaxonomyNames(merged, freshCategories);
    for (const c of merged) nextMap[c.id] = c;


    await yieldUI();

    let srSettingsApplied: SRSettings | null = null;
    let reviewLogApplied: ReviewLogEntry[] | null = null;
    let finalCategories: CategoryRecord[] = freshCategories;

    // ── 4. SINGLE SQLite ACID transaction across every affected table ──
    await exec.transaction(async (tx) => {
      progress(35, "Snimanje kategorija…");
      finalCategories = await writeCategoriesTx(tx, parsed, strategy, freshCategories);

      // A3 fix: pruneOrphans now lives in the orchestrator, BEFORE any
      // satellite write. Previously called at the tail of writeCategoriesTx,
      // which mutated `parsed.sources` in-place — `writeSourcesTx` then read
      // the already-mutated list and silently dropped orphan source rows
      // without any indication. Centralising the call here keeps the data
      // flow auditable: categories land → orphans pruned → satellites write.
      const validCategoryIds = new Set(finalCategories.map((c) => c.id));
      pruneOrphans(parsed, validCategoryIds);

      // Defensive scrub: drop merged cards whose categoryId no longer
      // resolves. With A2 (remap-before-merge) this is now a true safety
      // net rather than the primary filter — non-overwrite imports whose
      // backup has a categoryId not in either DB or `parsed.categories`
      // would still otherwise crash on FK 787 at the cards INSERT.
      const beforeLen = merged.length;
      let droppedCards = 0;
      for (let i = merged.length - 1; i >= 0; i--) {
        if (!validCategoryIds.has(merged[i].categoryId)) {
          delete nextMap[merged[i].id];
          merged.splice(i, 1);
          droppedCards += 1;
        }
      }
      if (droppedCards > 0) {
        backupLog.warn("import", "dropped cards with orphan categoryId", {
          dropped: droppedCards, before: beforeLen, after: merged.length,
        });
      }

      // Sources MUST land before cards: cards have FK `sourceId → sources(id)`.
      // Previously cards wrote first and any non-null sourceId triggered
      // SQLITE_CONSTRAINT_FOREIGNKEY (787). writeSourcesTx returns the final
      // valid source-id set so we can scrub stale refs from cards.
      progress(45, "Snimanje izvora…");
      const validSourceIds = await writeSourcesTx(tx, parsed, strategy);

      // Defensive scrub: any card with a sourceId that no longer resolves
      // (deleted source, partial backup, orphaned ref) gets nulled here
      // instead of crashing the whole tx. ON DELETE SET NULL covers the
      // delete path but not the initial INSERT.
      let scrubbed = 0;
      for (const card of merged) {
        if (card.sourceId && !validSourceIds.has(card.sourceId)) {
          card.sourceId = undefined;
          scrubbed += 1;
        }
      }
      if (scrubbed > 0) {
        backupLog.warn("import", "scrubbed orphan card.sourceId refs", { count: scrubbed });
      }

      progress(55, "Snimanje kartica…");
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
