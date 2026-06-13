/**
 * Shared types for the backup-import pipeline.
 */
import type { Card, SRSettings } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import type { ReviewLogEntry } from "@/lib/storage";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

export type ImportStrategy = "keep" | "overwrite" | "skip" | "newer";

export interface ImportTxResult {
  merged: Card[];
  nextMap: Record<string, Card>;
  freshCategories: CategoryRecord[];
  srSettingsApplied: SRSettings | null;
  reviewLogApplied: ReviewLogEntry[] | null;
}

export interface ImportCtx {
  parsed: ParsedBackup;
  strategy: ImportStrategy;
  currentMap: Record<string, Card>;
  onProgress?: (pct: number, label: string) => void;
}

export type ProgressFn = (pct: number, label: string) => void;
