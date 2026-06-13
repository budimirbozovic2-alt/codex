/**
 * editor-v4 backup validation CLI.
 *
 * Usage:
 *   bun src/scripts/migrate-editor-v4.ts <path-to-backup.json>
 *
 * Validates a v7 backup JSON file and reports entity counts. Legacy HTML/markdown
 * migration paths were removed after the editor-v4 cut-over — backups must carry
 * canonical `contentDoc` payloads.
 */
import { readFileSync } from "node:fs";
import { assertBackupVersion } from "@/lib/backup/migrate";
import { BackupSchema } from "@/lib/migrations/backup-schema";

interface Report {
  migrated: { cards: number; sources: number; articles: number };
  failed:   { cards: number; sources: number; articles: number };
  samplesWithDataLoss: Array<{
    kind: "card" | "source" | "article";
    id: string;
    warning: string;
    snippet: string;
  }>;
}

export function runMigrationDryRun(payload: unknown): Report {
  assertBackupVersion(payload);
  const parsed = BackupSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid v7 backup: ${parsed.error.issues[0]?.message ?? "parse failed"}`);
  }

  return {
    migrated: {
      cards: parsed.data.cards.length,
      sources: parsed.data.sources.length,
      articles: parsed.data.knowledgeBaseArticles.length,
    },
    failed: { cards: 0, sources: 0, articles: 0 },
    samplesWithDataLoss: [],
  };
}

const isMain = (() => {
  try {
    const argv1 = process.argv[1] ?? "";
    return argv1.endsWith("migrate-editor-v4.ts") || argv1.endsWith("migrate-editor-v4.js");
  } catch { return false; }
})();

if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: bun src/scripts/migrate-editor-v4.ts <backup.json>");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(file, "utf-8"));
  const report = runMigrationDryRun(raw);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
