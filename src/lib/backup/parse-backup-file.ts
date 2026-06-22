import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import { migrateBackup, assertBackupVersion, BackupVersionError } from "@/lib/backup/migrate";
import { convertTemplateToParsedBackup, isTemplateExport } from "@/lib/backup/template-import";
import { convertEmergencyToParsedBackup, isLegacyEmergencyExport } from "@/lib/backup/emergency-import";
import { healBackupRaw } from "@/lib/backup/heal-backup";
import { yieldUI } from "@/lib/backup/yield-ui";
import { parseJsonInWorker } from "@/lib/zip-service";
import {
  computeBackupIntegrityStats,
  type BackupIntegrityStats,
  type BackupExportMetadata,
} from "@/lib/backup/backup-integrity";

export interface ParsedBackupFile {
  raw: unknown;
  parsed: ParsedBackup;
  integrity: BackupIntegrityStats;
  exportMetadata: BackupExportMetadata | null;
}

function readExportMetadata(raw: unknown): BackupExportMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const em = (raw as { exportMetadata?: unknown }).exportMetadata;
  if (!em || typeof em !== "object") return null;
  const m = em as Record<string, unknown>;
  if (typeof m.schemaVersion !== "number" || typeof m.exportedAt !== "number") {
    return null;
  }
  return {
    schemaVersion: m.schemaVersion,
    exportedAt: m.exportedAt,
    cardCount: Number(m.cardCount ?? 0),
    sagaLinkCount: Number(m.sagaLinkCount ?? 0),
    endangeredCount: Number(m.endangeredCount ?? 0),
    orphanParentIdCount: Number(m.orphanParentIdCount ?? 0),
  };
}

/** Parse + validate backup file without writing to SQLite (dry-run / test restore). */
export async function parseBackupFile(file: File): Promise<ParsedBackupFile> {
  let raw: unknown;
  try {
    raw = await parseJsonInWorker(file);
  } catch (err) {
    throw new Error(
      `Neispravan fajl: ${err instanceof Error ? err.message : "ne mogu pročitati JSON."}`,
    );
  }

  let parsed: ParsedBackup;

  if (isTemplateExport(raw)) {
    parsed = convertTemplateToParsedBackup(raw);
  } else if (isLegacyEmergencyExport(raw)) {
    parsed = convertEmergencyToParsedBackup(raw);
  } else {
    const { raw: healedRaw } = healBackupRaw(raw);
    raw = healedRaw;
    assertBackupVersion(raw);
    await yieldUI();
    const result = BackupSchema.safeParse(raw);
    await yieldUI();
    if (!result.success) {
      const issues = result.error.issues.slice(0, 5);
      const summary = issues
        .map((iss) => `• ${iss.path.join(".") || "(root)"} — ${iss.message}`)
        .join("\n");
      throw new Error(`Backup nije validan:\n${summary}`);
    }
    parsed = migrateBackup(result.data);
  }

  const integrity = computeBackupIntegrityStats(parsed.cards);
  const exportMetadata = readExportMetadata(raw);

  return { raw, parsed, integrity, exportMetadata };
}

export { BackupVersionError };
