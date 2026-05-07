export type Step =
  | "menu"
  | "export"
  | "exporting"
  | "import-pick"
  | "import-validating"
  | "import-confirm"
  | "import-conflict"
  | "importing";

export interface ImportValidation {
  file: File;
  totalCards: number;
  totalCategories: number;
  hasProgress: boolean;
  type: string;
  fileSizeKB: number;
  duplicateCount: number;
  duplicateCategoryCount: number;
  uniqueCount: number;
  valid: boolean;
  errors: string[];
  fileVersion: number | null;
  appVersion: number;
  willMigrate: boolean;
}

export type ImportStrategy = "keep" | "overwrite" | "skip" | "newer";
