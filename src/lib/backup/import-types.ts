/**
 * Shared types for the backup-import pipeline.
 *
 * Carved out of `import-transaction.ts` so the splittable write helpers
 * (`writeCardsTx`, `writeCategoriesTx`, `writeSatelliteTablesTx`) can
 * import the shapes without pulling the orchestrator's transactional code.
 */
import type { Card, SRSettings } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db";
import type { ReviewLogEntry } from "@/lib/storage";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

export type ImportStrategy = "keep" | "overwrite" | "skip" | "newer";

export interface ImportTxResult {
  /** Cards that should land in the in-memory map (post-merge). */
  merged: Card[];
  /** Final cardId → Card map snapshot, ready for setCardMapState. */
  nextMap: Record<string, Card>;
  /** Final categoryRecords snapshot for AppContext. */
  freshCategories: CategoryRecord[];
  /** Resolver report for the Toast summary. */
  legacyResolveReport: {
    resolvedSubcategory: number;
    resolvedChapter: number;
    unresolvedSubcategory: number;
    unresolvedChapter: number;
  } | null;
  /** Final SR settings, if the backup overwrote them. */
  srSettingsApplied: SRSettings | null;
  /** Final review log array if it was overwritten. */
  reviewLogApplied: ReviewLogEntry[] | null;
}

export interface ImportCtx {
  parsed: ParsedBackup;
  strategy: ImportStrategy;
  /** Current in-memory cardMap before import (used for merge strategies). */
  currentMap: Record<string, Card>;
  onProgress?: (pct: number, label: string) => void;
}

export type ProgressFn = (pct: number, label: string) => void;
