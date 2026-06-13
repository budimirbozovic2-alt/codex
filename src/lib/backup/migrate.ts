/**
 * Backup schema version gate.
 *
 * Only v7 full backups are accepted. Older on-disk formats must be re-exported
 * from a current app build before import — the legacy migration ladder is gone.
 */
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

export const BACKUP_SCHEMA_VERSION = 7;

export class BackupVersionError extends Error {
  constructor(public readonly fileVersion: number, public readonly appVersion: number) {
    super(
      fileVersion === 0
        ? `Backup nema podržanu verziju (očekivano v${appVersion}). Izvezite novi backup iz trenutne aplikacije.`
        : fileVersion > appVersion
          ? `Backup je iz novije verzije aplikacije (v${fileVersion}). Trenutna app šema: v${appVersion}. Ažurirajte aplikaciju prije uvoza.`
          : `Backup je u zastarjelom formatu (v${fileVersion}). Izvezite novi v${appVersion} backup iz trenutne aplikacije prije uvoza.`,
    );
    this.name = "BackupVersionError";
  }
}

function readVersion(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const v = (raw as { version?: unknown }).version;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** Pre-Zod gate — rejects anything other than the current schema version. */
export function assertBackupVersion(raw: unknown): void {
  const fileVersion = readVersion(raw);
  if (fileVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupVersionError(fileVersion, BACKUP_SCHEMA_VERSION);
  }
}

/** Post-Zod stamp — parsed payload must already be v7. */
export function migrateBackup(parsed: ParsedBackup): ParsedBackup {
  assertBackupVersion(parsed);
  return parsed;
}
