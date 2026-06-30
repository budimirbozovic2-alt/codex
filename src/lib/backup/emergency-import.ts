/**
 * Legacy v5 `emergency-backup` → v7 ParsedBackup converter.
 * New emergency exports are already v7 and import via the normal path.
 */
import { BackupSchema, type ParsedBackup } from "@/lib/migrations/backup-schema";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";

export const LEGACY_EMERGENCY_VERSION = 5;

export function isLegacyEmergencyExport(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  if (o.type !== "emergency-backup") return false;
  const version = typeof o.version === "number" && Number.isFinite(o.version)
    ? Math.floor(o.version)
    : 0;
  return version > 0 && version < BACKUP_SCHEMA_VERSION;
}

function arrayField(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

export function convertEmergencyToParsedBackup(raw: unknown): ParsedBackup {
  if (!isLegacyEmergencyExport(raw)) {
    throw new Error("Fajl nije legacy hitni backup (očekivano type: \"emergency-backup\", verzija < v7).");
  }

  const o = raw as Record<string, unknown>;
  const parsed: ParsedBackup = {
    version: BACKUP_SCHEMA_VERSION,
    type: "full",
    cards: arrayField(o.cards) as ParsedBackup["cards"],
    categories: arrayField(o.categories) as ParsedBackup["categories"],
    subcategories: o.subcategories,
    sources: arrayField(o.sources) as ParsedBackup["sources"],
    reviewLog: arrayField(o.reviewLog) as ParsedBackup["reviewLog"],
    srSettings: o.srSettings as ParsedBackup["srSettings"],
    mindMaps: arrayField(o.mindMaps) as ParsedBackup["mindMaps"],
    diary: arrayField(o.diary) as ParsedBackup["diary"],
    calibrationLog: arrayField(o.calibrationLog) as ParsedBackup["calibrationLog"],
    latencyLog: arrayField(o.latencyLog) as ParsedBackup["latencyLog"],
    slippageLog: arrayField(o.slippageLog) as ParsedBackup["slippageLog"],
    activityLog: arrayField(o.activityLog) as ParsedBackup["activityLog"],
    disciplineLog: arrayField(o.disciplineLog) as ParsedBackup["disciplineLog"],
    pomodoroLog: arrayField(o.pomodoroLog) as ParsedBackup["pomodoroLog"],
    knowledgeBaseArticles: [],
    mnemonics: [],
    majorSystem: [],
    mnemonicTestLog: [],
    settings: [],
  };

  const result = BackupSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(
      issue
        ? `Hitni backup nije validan nakon konverzije: ${issue.path.join(".") || "(root)"} — ${issue.message}`
        : "Hitni backup nije validan nakon konverzije.",
    );
  }

  return result.data;
}
