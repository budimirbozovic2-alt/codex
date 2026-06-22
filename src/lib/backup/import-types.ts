/**
 * Shared types for the backup-import pipeline.
 */
import type { Card, SRSettings } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
import type { ReviewLogEntry } from "@/lib/types/logs";
import type { ParsedBackup } from "@/lib/migrations/backup-schema";
import type { SqlExecutor } from "@/lib/persistence/sqlite/executor";

export type ImportStrategy = "keep" | "overwrite" | "newer";

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
  /** Target executor — defaults to active readyMachine backend. */
  exec?: SqlExecutor;
}

export type ProgressFn = (pct: number, label: string) => void;
