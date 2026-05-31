/**
 * editor-v4 dry-run migration CLI.
 *
 * Usage:
 *   bun src/scripts/migrate-editor-v4.ts <path-to-backup.json>
 *
 * Reads a Data Backup v5+ JSON file (the format produced by `streamBackup`),
 * runs every card.section / source.htmlContent / article.content payload
 * through the editor-v4 dispatcher, and prints a JSON report:
 *
 *   {
 *     migrated:            { cards, sources, articles },
 *     failed:              { cards, sources, articles },
 *     samplesWithDataLoss: [ { kind, id, warning, snippet } ]
 *   }
 *
 * Exits with non-zero code if anything failed or any data-loss sample exists,
 * making it safe to wire into CI as a pre-flight against user backups.
 *
 * The script does NOT open IndexedDB and does NOT mutate the backup file —
 * it is a pure analysis pass over the JSON payload.
 */
import { readFileSync } from "node:fs";
import { migrateRaw } from "@/lib/backup/migrate";
import { migrateCard, migrateSource, migrateArticle } from "@/lib/editor-v4/migrate";
import type { Card } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";

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

function snippet(s: string, n = 120): string {
  const flat = (s ?? "").replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : flat.slice(0, n) + "…";
}

export function runMigrationDryRun(payload: unknown): Report {
  const migrated = migrateRaw(payload) as {
    cards?: Card[];
    sources?: Source[];
    knowledgeBaseArticles?: KnowledgeBaseArticle[];
  };
  const report: Report = {
    migrated: { cards: 0, sources: 0, articles: 0 },
    failed:   { cards: 0, sources: 0, articles: 0 },
    samplesWithDataLoss: [],
  };

  for (const card of migrated.cards ?? []) {
    try {
      const res = migrateCard(card);
      if (res.changed) report.migrated.cards++;
      for (const w of res.warnings) {
        const src = card.sections.map((s) => (s as { content?: string }).content ?? "").join("\n");
        report.samplesWithDataLoss.push({ kind: "card", id: card.id, warning: w, snippet: snippet(src) });
      }
    } catch (err) {
      report.failed.cards++;
      report.samplesWithDataLoss.push({
        kind: "card", id: card.id,
        warning: `EXCEPTION: ${(err as Error).message}`,
        snippet: snippet((card.sections?.[0] as { content?: string } | undefined)?.content ?? ""),
      });
    }
  }

  for (const src of migrated.sources ?? []) {
    try {
      const res = migrateSource(src);
      if (res.changed) report.migrated.sources++;
      const legacyHtml = (src as unknown as { htmlContent?: string }).htmlContent ?? "";
      for (const w of res.warnings) {
        report.samplesWithDataLoss.push({ kind: "source", id: src.id, warning: w, snippet: snippet(legacyHtml) });
      }
    } catch (err) {
      report.failed.sources++;
      report.samplesWithDataLoss.push({
        kind: "source", id: src.id,
        warning: `EXCEPTION: ${(err as Error).message}`,
        snippet: snippet((src as unknown as { htmlContent?: string }).htmlContent ?? ""),
      });
    }
  }

  for (const art of migrated.knowledgeBaseArticles ?? []) {
    try {
      const res = migrateArticle(art);
      if (res.changed) report.migrated.articles++;
      const legacyMd = (art as unknown as { content?: string }).content ?? "";
      for (const w of res.warnings) {
        report.samplesWithDataLoss.push({ kind: "article", id: art.id, warning: w, snippet: snippet(legacyMd) });
      }
    } catch (err) {
      report.failed.articles++;
      report.samplesWithDataLoss.push({
        kind: "article", id: art.id,
        warning: `EXCEPTION: ${(err as Error).message}`,
        snippet: snippet((art as unknown as { content?: string }).content ?? ""),
      });
    }
  }

  return report;
}

// CLI entry point — invoked when run directly with bun/node.
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
  const fails = report.failed.cards + report.failed.sources + report.failed.articles;
  process.exit(fails > 0 || report.samplesWithDataLoss.length > 0 ? 1 : 0);
}
