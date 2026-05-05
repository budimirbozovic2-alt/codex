/**
 * Backup schema migration ladder.
 *
 * Reads `parsed.version` (defaults to 1 for ancient backups that pre-date the
 * marker) and runs each migration step `n → n+1` until the payload matches
 * `BACKUP_SCHEMA_VERSION`. Backups newer than the running app are rejected
 * outright — silently importing unknown future fields would risk corruption.
 *
 * The migrate functions operate on the *parsed* (post-Zod) shape; cross-cutting
 * sanitization is already handled by BackupSchema, so each step is responsible
 * only for structural transforms (renames, defaults, derivations).
 */
import type { ParsedBackup } from "@/lib/migrations/backup-schema";

export const BACKUP_SCHEMA_VERSION = 7;

type MigrateStep = (b: ParsedBackup) => ParsedBackup;

/** Each step migrates FROM the keyed version TO the next. */
const STEPS: Record<number, MigrateStep> = {
  // v1→v2: pre-UUID legacy backups. The legacy resolver in useCardImport
  // handles name→UUID once categories are remapped; this step is a passthrough
  // that just promotes the marker so subsequent steps see a numeric version.
  1: (b) => b,
  2: (b) => b,
  3: (b) => b,
  4: (b) => b,
  // v5→v6: `settings` table introduced. Default to empty array so import path
  // never NPE-s on `parsed.settings.length`.
  5: (b) => ({ ...b, settings: Array.isArray(b.settings) ? b.settings : [] }),
  // v6→v7: `knowledgeBaseArticles` introduced. Default to empty array.
  6: (b) => ({
    ...b,
    knowledgeBaseArticles: Array.isArray(b.knowledgeBaseArticles)
      ? b.knowledgeBaseArticles
      : [],
  }),
};

export class BackupVersionError extends Error {
  constructor(public readonly fileVersion: number, public readonly appVersion: number) {
    super(
      `Backup je iz novije verzije aplikacije (v${fileVersion}). Trenutna app šema: v${appVersion}. Ažurirajte aplikaciju prije uvoza.`,
    );
    this.name = "BackupVersionError";
  }
}

/**
 * Run sequential migrations from `parsed.version` up to BACKUP_SCHEMA_VERSION.
 * Throws BackupVersionError if the file is from a newer schema than the app.
 */
export function migrateBackup(parsed: ParsedBackup): ParsedBackup {
  const raw = (parsed as { version?: unknown }).version;
  let v = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;

  if (v > BACKUP_SCHEMA_VERSION) {
    throw new BackupVersionError(v, BACKUP_SCHEMA_VERSION);
  }

  let current = parsed;
  while (v < BACKUP_SCHEMA_VERSION) {
    const step = STEPS[v];
    if (step) current = step(current);
    v++;
  }
  // Stamp the post-migration version so downstream code can trust the marker.
  return { ...current, version: BACKUP_SCHEMA_VERSION } as ParsedBackup;
}
