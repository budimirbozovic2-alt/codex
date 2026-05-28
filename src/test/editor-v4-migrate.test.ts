/**
 * editor-v4 migration engine tests.
 *
 * Zero data-loss tolerance for wiki-links, mindmap embeds and key-part marks
 * across cards, sources and articles. Also asserts idempotency — re-running
 * the dispatcher over its own output is a no-op.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { migrateCard, migrateSource, migrateArticle } from "@/lib/editor-v4/migrate";
import { runMigrationDryRun } from "@/scripts/migrate-editor-v4";
import { docToHtml } from "@/lib/editor-v4/codecs/doc-to-html";
import type { Card } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";

const fixturePath = resolve(__dirname, "fixtures/editor-v4-backup.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8")) as {
  cards: Card[];
  sources: Source[];
  knowledgeBaseArticles: KnowledgeBaseArticle[];
};

describe("editor-v4 migrate", () => {
  it("dry-run report: 0 failed, 0 samplesWithDataLoss on fixture backup", () => {
    const report = runMigrationDryRun(fixture);
    expect(report.failed.cards).toBe(0);
    expect(report.failed.sources).toBe(0);
    expect(report.failed.articles).toBe(0);
    expect(report.samplesWithDataLoss).toEqual([]);
    expect(report.migrated.cards).toBe(4);
    expect(report.migrated.sources).toBe(1);
    expect(report.migrated.articles).toBe(2);
  });

  it("migrateCard is idempotent", () => {
    const card = fixture.cards[0];
    const r1 = migrateCard(card);
    expect(r1.changed).toBe(true);
    expect(r1.record.sections[0].contentDoc?.version).toBe(4);

    const r2 = migrateCard(r1.record);
    expect(r2.changed).toBe(false);
    expect(r2.record).toBe(r1.record);
  });

  it("migrateSource is idempotent", () => {
    const r1 = migrateSource(fixture.sources[0]);
    expect(r1.changed).toBe(true);
    expect(r1.record.contentDoc?.version).toBe(4);

    const r2 = migrateSource(r1.record);
    expect(r2.changed).toBe(false);
    expect(r2.record).toBe(r1.record);
  });

  it("migrateArticle is idempotent (and handles empty content)", () => {
    const r1 = migrateArticle(fixture.knowledgeBaseArticles[0]);
    expect(r1.changed).toBe(true);
    expect(r1.record.contentDoc?.version).toBe(4);
    expect(r1.warnings).toEqual([]);

    const r2 = migrateArticle(r1.record);
    expect(r2.changed).toBe(false);

    // Empty article: changes to mark contentDoc, but no warnings.
    const empty = migrateArticle(fixture.knowledgeBaseArticles[1]);
    expect(empty.changed).toBe(true);
    expect(empty.record.contentDoc?.content).toEqual({ type: "doc", content: [] });
  });

  it("round-trip preserves wiki/mindmap markers in card sections", () => {
    const card = fixture.cards[0]; // card-wiki
    const r = migrateCard(card);
    const html = docToHtml(r.record.sections[0].contentDoc!);
    // The wiki node serializes as <a data-wikilink="…">. Both targets must survive.
    expect(html).toContain('data-wikilink="Krivično djelo"');
    expect(html).toContain('data-wikilink="Ugovor"');
  });

  it("round-trip preserves mindmap embed", () => {
    const card = fixture.cards[1]; // card-mindmap
    const r = migrateCard(card);
    const html = docToHtml(r.record.sections[0].contentDoc!);
    expect(html).toContain("11111111-2222-3333-4444-555555555555");
  });

  it("round-trip preserves key-part mark", () => {
    const card = fixture.cards[2]; // card-keypart
    const r = migrateCard(card);
    const html = docToHtml(r.record.sections[0].contentDoc!);
    expect(html).toMatch(/key-part-highlight/);
    expect(html).toContain("essentialia negotii");
  });

  it("empty section content yields empty doc, no warnings", () => {
    const r = migrateCard(fixture.cards[3]); // card-empty
    expect(r.changed).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.record.sections[0].contentDoc).toEqual({
      version: 4,
      content: { type: "doc", content: [] },
    });
  });
});
