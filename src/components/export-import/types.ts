import type { ParsedBackup } from "@/lib/migrations/backup-schema";

export type Step =
  | "menu"
  | "export"
  | "exporting"
  | "import-pick"
  | "import-validating"
  | "import-confirm"
  | "import-conflict"
  | "importing";

export interface PreparedImport {
  parsed: ParsedBackup;
  raw: unknown;
}

export interface ImportValidation {
  file: File;
  totalCards: number;
  totalCategories: number;
  hasProgress: boolean;
  type: string;
  fileSizeKB: number;
  duplicateCount: number;
  duplicateCategoryCount: number;
  /** Authoritative SQLite card count at validation time (not TanStack cache). */
  existingCardsCount: number;
  uniqueCount: number;
  valid: boolean;
  errors: string[];
  fileVersion: number | null;
  appVersion: number;
  willMigrate: boolean;
  /** Populated when parse + validation succeed — reused by import apply. */
  prepared: PreparedImport | null;
}

export type ImportStrategy = "keep" | "overwrite" | "newer";
