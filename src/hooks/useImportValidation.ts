// PR-9 A1b P1.B — unified with prepare-import-file (single parse path).
import { prepareImportFile } from "@/lib/backup/prepare-import-file";
import type { ImportValidation } from "@/components/export-import/types";

export type ProgressFn = (pct: number, msg: string) => void;

export async function validateImportFile(
  file: File,
  onProgress: ProgressFn,
): Promise<ImportValidation> {
  const { validation } = await prepareImportFile(file, onProgress);
  return validation;
}

export { prepareImportFile, type PreparedImport } from "@/lib/backup/prepare-import-file";
