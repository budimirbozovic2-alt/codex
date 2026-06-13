/**
 * editor-v4 migration engine tests.
 *
 * Runtime lazy-migrate helpers (`migrateCard`, etc.) still accept legacy HTML/markdown
 * on read boundaries. v7 backup import requires canonical `contentDoc` only.
 */
import { describe, it, expect } from "vitest";
import { htmlToDoc } from "@/lib/editor-v4";
import { migrateCard, migrateSource, migrateArticle, mdToHtml } from "@/lib/editor-v4/migrate";
import { runMigrationDryRun } from "@/scripts/migrate-editor-v4";
import { docToHtml } from "@/lib/editor-v4/codecs/doc-to-html";
import type { Card } from "@/lib/spaced-repetition";
import type { Source, KnowledgeBaseArticle } from "@/lib/db-types";

const EMPTY_DOC = { version: 4 as const, content: { type: "doc", content: [] } };

const sectionDefaults = {
  state: 0, stability: 0, difficulty: 0, interval: 0,
  nextReview: 0, lastReviewed: null, lapses: 0,
  elapsedDays: 0, scheduledDays: 0, firstReviewPending: true,
};

/** Legacy-shaped records for runtime migrate* unit tests (not valid v7 backup rows). */
const legacyCards: Card[] = [
  {
    id: "card-wiki", question: "Šta je krivično djelo?", categoryId: "cat-1",
    createdAt: 1700000000000, readCount: 0, type: "essay",
    sections: [{
      id: "sec-1", title: "Definicija",
      content: "<p>Reference: [[Krivično djelo]] i [[Ugovor|ugovornog odnosa]].</p>",
      ...sectionDefaults,
    } as Card["sections"][number]],
  } as Card,
  {
    id: "card-mindmap", question: "Mapa pojmova", categoryId: "cat-1",
    createdAt: 1700000000000, readCount: 0, type: "essay",
    sections: [{
      id: "sec-2", title: "Slika",
      content: "<p>Pogledaj:</p>::mindmap[11111111-2222-3333-4444-555555555555]<p>iznad.</p>",
      ...sectionDefaults,
    } as Card["sections"][number]],
  } as Card,
  {
    id: "card-keypart", question: "Bitni elementi", categoryId: "cat-1",
    createdAt: 1700000000000, readCount: 0, type: "essay",
    sections: [{
      id: "sec-3", title: "Definicija",
      content: "<p>Ključni dio: <mark class=\"key-part-highlight\">essentialia negotii</mark> ugovora.</p>",
      ...sectionDefaults,
    } as Card["sections"][number]],
  } as Card,
  {
    id: "card-empty", question: "Empty", categoryId: "cat-1",
    createdAt: 1700000000000, readCount: 0, type: "flash",
    sections: [{ id: "sec-empty", title: "Prazno", content: "", ...sectionDefaults } as Card["sections"][number]],
  } as Card,
];

const legacySource = {
  id: "src-1", categoryId: "cat-1", title: "Test Source", date: "2024-01-01",
  htmlContent: "<h2>Bitni elementi ugovora</h2><p>Vidi [[Ugovor|ugovornog odnosa]] i <mark class=\"key-part-highlight\">essentialia negotii</mark>.</p>::mindmap[12345678-aaaa-bbbb-cccc-dddddddddddd]",
  outline: [], articles: [], version: 1, createdAt: 1700000000000, updatedAt: 1700000000000,
} as unknown as Source;

const legacyArticles: KnowledgeBaseArticle[] = [
  {
    id: "art-1", subjectId: "cat-1", title: "Ugovor",
    content: "# Ugovor\n\nUgovor je saglasnost volja. Vidi [[Krivično djelo]] i [[Kauza|kauze]].\n\n## Bitni elementi\n\n- Saglasnost\n- Predmet\n- Osnov\n\n::mindmap[aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee]",
    linkedSourceIds: [], createdAt: 1700000000000, updatedAt: 1700000000000,
  } as unknown as KnowledgeBaseArticle,
  {
    id: "art-2", subjectId: "cat-1", title: "Krivično djelo",
    content: "", linkedSourceIds: [], createdAt: 1700000000000, updatedAt: 1700000000000,
  } as unknown as KnowledgeBaseArticle,
];

const v7Backup = {
  version: 7,
  type: "full",
  categories: [{ id: "cat-1", name: "Test Subject", sortOrder: 0, subcategories: [] }],
  cards: legacyCards.map((c) => ({
    ...c,
    sections: c.sections.map((s) => {
      const legacy = s as Card["sections"][number] & { content?: string };
      const { content, ...rest } = legacy;
      return {
        ...rest,
        contentDoc: content ? htmlToDoc(content) : EMPTY_DOC,
      };
    }),
  })),
  sources: [{
    id: legacySource.id,
    categoryId: legacySource.categoryId,
    title: legacySource.title,
    date: legacySource.date,
    contentDoc: htmlToDoc((legacySource as unknown as { htmlContent: string }).htmlContent),
    outline: [], articles: [], version: 1,
    createdAt: legacySource.createdAt, updatedAt: legacySource.updatedAt,
  }],
  knowledgeBaseArticles: legacyArticles.map((a) => ({
    id: a.id,
    subjectId: a.subjectId,
    title: a.title,
    contentDoc: (a as unknown as { content?: string }).content
      ? htmlToDoc(mdToHtml((a as unknown as { content: string }).content))
      : EMPTY_DOC,
    linkedSourceIds: a.linkedSourceIds,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  })),
  reviewLog: [],
  pomodoroLog: [],
  settings: [],
  diary: [],
  mindMaps: [],
  mnemonics: [],
  majorSystem: [],
  mnemonicTestLog: [],
  calibrationLog: [],
  latencyLog: [],
  slippageLog: [],
  activityLog: [],
  disciplineLog: [],
};

describe("editor-v4 migrate", () => {
  it("dry-run report: validates v7 backup entity counts", () => {
    const report = runMigrationDryRun(v7Backup);
    expect(report.failed.cards).toBe(0);
    expect(report.failed.sources).toBe(0);
    expect(report.failed.articles).toBe(0);
    expect(report.samplesWithDataLoss).toEqual([]);
    expect(report.migrated.cards).toBe(4);
    expect(report.migrated.sources).toBe(1);
    expect(report.migrated.articles).toBe(2);
  });

  it("migrateCard is idempotent", () => {
    const card = legacyCards[0];
    const r1 = migrateCard(card);
    expect(r1.changed).toBe(true);
    expect(r1.record.sections[0].contentDoc?.version).toBe(4);

    const r2 = migrateCard(r1.record);
    expect(r2.changed).toBe(false);
    expect(r2.record).toBe(r1.record);
  });

  it("migrateSource is idempotent", () => {
    const r1 = migrateSource(legacySource);
    expect(r1.changed).toBe(true);
    expect(r1.record.contentDoc?.version).toBe(4);

    const r2 = migrateSource(r1.record);
    expect(r2.changed).toBe(false);
    expect(r2.record).toBe(r1.record);
  });

  it("migrateArticle is idempotent (and handles empty content)", () => {
    const r1 = migrateArticle(legacyArticles[0]);
    expect(r1.changed).toBe(true);
    expect(r1.record.contentDoc?.version).toBe(4);
    expect(r1.warnings).toEqual([]);

    const r2 = migrateArticle(r1.record);
    expect(r2.changed).toBe(false);

    const empty = migrateArticle(legacyArticles[1]);
    expect(empty.changed).toBe(true);
    expect(empty.record.contentDoc?.content).toEqual({ type: "doc", content: [] });
  });

  it("round-trip preserves wiki/mindmap markers in card sections", () => {
    const r = migrateCard(legacyCards[0]);
    const html = docToHtml(r.record.sections[0].contentDoc!);
    expect(html).toContain('data-wikilink="Krivično djelo"');
    expect(html).toContain('data-wikilink="Ugovor"');
  });

  it("round-trip preserves mindmap embed", () => {
    const r = migrateCard(legacyCards[1]);
    const html = docToHtml(r.record.sections[0].contentDoc!);
    expect(html).toContain("11111111-2222-3333-4444-555555555555");
  });

  it("round-trip preserves key-part mark", () => {
    const r = migrateCard(legacyCards[2]);
    const html = docToHtml(r.record.sections[0].contentDoc!);
    expect(html).toMatch(/key-part-highlight/);
    expect(html).toContain("essentialia negotii");
  });

  it("empty section content yields empty doc, no warnings", () => {
    const r = migrateCard(legacyCards[3]);
    expect(r.changed).toBe(true);
    expect(r.warnings).toEqual([]);
    expect(r.record.sections[0].contentDoc).toEqual(EMPTY_DOC);
  });
});
