import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { BackupSchema } from "@/lib/migrations/backup-schema";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";
import { healBackupRaw, needsBackupHeal } from "./heal-backup";

function legacyV7Backup() {
  return {
    version: BACKUP_SCHEMA_VERSION,
    type: "full" as const,
    categories: [
      {
        id: "cat-1",
        name: "Krivično procesno pravo",
        sortOrder: 0,
        subcategories: [
          { id: "sub-1", name: "OPŠTE ODREDBE", sortOrder: 0, chapters: [] },
        ],
      },
    ],
    cards: [
      {
        id: "card-1",
        question: "Ustav Crne Gore",
        categoryId: "cat-1",
        subcategoryId: "sub-1",
        createdAt: 1700000000000,
        readCount: 0,
        type: "essay",
        sections: [
          {
            id: "sec-1",
            title: "Odgovor",
            content: "<p><strong>Ustav</strong> je akt najviše pravne snage.</p>",
            state: 0,
            stability: 0,
            difficulty: 5,
            interval: 0,
            nextReview: 0,
            lastReviewed: null,
            lapses: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            firstReviewPending: false,
          },
        ],
      },
    ],
    sources: [
      {
        id: "src-1",
        categoryId: "cat-1",
        title: "Test Source",
        htmlContent: "<h2>Član 1</h2><p>Tekst propisa.</p>",
        outline: [],
        articles: [],
        version: 1,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
      },
    ],
    slippageLog: [
      {
        date: "2026-05-03",
        appEntryTime: 1,
        firstActionTime: 2,
        slippageMs: 100,
        id: 1,
      },
    ],
    reviewLog: [],
    settings: [],
    mindMaps: [],
    knowledgeBaseArticles: [],
  };
}

describe("healBackupRaw", () => {
  it("detects legacy HTML sections", () => {
    const raw = legacyV7Backup();
    expect(needsBackupHeal(raw)).toBe(true);
    expect(BackupSchema.safeParse(raw).success).toBe(false);
  });

  it("converts section content and source htmlContent to contentDoc", () => {
    const raw = legacyV7Backup();
    const { raw: healed, report } = healBackupRaw(raw);
    expect(report.sectionsHealed).toBe(1);
    expect(report.sourcesHealed).toBe(1);
    expect(report.satelliteRowsCleaned).toBe(1);

    const result = BackupSchema.safeParse(healed);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const sec = result.data.cards[0].sections[0];
    expect(sec.contentDoc.version).toBe(4);
    expect(sec.contentDoc.content.type).toBe("doc");
    expect(result.data.sources[0].contentDoc.version).toBe(4);
    expect(result.data.slippageLog).toHaveLength(1);
  });

  it("is a no-op for backups that already have contentDoc", () => {
    const raw = legacyV7Backup();
    const { raw: healedOnce } = healBackupRaw(raw);
    const { raw: healedTwice, report } = healBackupRaw(healedOnce);
    expect(report.sectionsHealed).toBe(0);
    expect(report.sourcesHealed).toBe(0);
    expect(needsBackupHeal(healedTwice)).toBe(false);
  });

  it("unwraps legacy category structure.subcategories", () => {
    const raw = {
      ...legacyV7Backup(),
      categories: [
        {
          id: "cat-1",
          name: "Test",
          sortOrder: 0,
          structure: { subcategories: [{ id: "s1", name: "Sub", sortOrder: 0, chapters: [] }] },
        },
      ],
    };
    const { raw: healed, report } = healBackupRaw(raw);
    expect(report.categoriesHealed).toBe(1);
    const cat = (healed as { categories: Array<{ subcategories: unknown[]; structure?: unknown }> }).categories[0];
    expect(cat.subcategories).toHaveLength(1);
    expect(cat.structure).toBeUndefined();
  });

  it("heals knowledge base markdown, mnemonics, review log, and diary", () => {
    const raw = {
      ...legacyV7Backup(),
      cards: [],
      sources: [],
      slippageLog: [],
      knowledgeBaseArticles: [
        {
          id: "kb-1",
          subjectId: "cat-1",
          title: "Članak",
          content: "Prvi pasus.\n\nDrugi pasus.",
          linkedSourceIds: [],
          tags: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      mnemonics: [
        {
          id: "mn-1",
          question: "Pitanje",
          category: "legacy-cat",
          subcategory: "legacy-sub",
          sections: [{ title: "Sekcija", content: "<p>Mnemonic</p>" }],
          tags: [],
          mnemonicVideo: "",
          acronym: "",
          createdAt: 1,
        },
      ],
      reviewLog: [
        {
          cardId: "c1",
          sectionId: "s1",
          grade: 3,
          timestamp: 1,
          category: "test",
          id: "extra",
        },
      ],
      diary: [{ date: "2026-05-03", dailyGoal: "", selfAnalysis: "Zapis" }],
    };
    const { raw: healed, report } = healBackupRaw(raw);
    expect(report.knowledgeBaseHealed).toBe(1);
    expect(report.mnemonicsHealed).toBe(1);
    expect(report.satelliteRowsCleaned).toBe(2);

    const result = BackupSchema.safeParse(healed);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.knowledgeBaseArticles[0].contentDoc.version).toBe(4);
    expect(result.data.mnemonics[0].sections[0].contentDoc.version).toBe(4);
    expect(result.data.reviewLog).toHaveLength(1);
    expect(result.data.diary[0].id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  const MAY_FIXTURE = ".tmp-backup-may/codex-backup-2026-05-03.json";

  it.skipIf(!existsSync(MAY_FIXTURE))(
    "parses real May 2026 legacy backup fixture",
    () => {
      const raw = JSON.parse(readFileSync(MAY_FIXTURE, "utf8"));
      expect(needsBackupHeal(raw)).toBe(true);
      const { raw: healed, report } = healBackupRaw(raw);
      expect(report.sectionsHealed).toBeGreaterThan(1500);
      const result = BackupSchema.safeParse(healed);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cards.length).toBe(806);
      }
    },
    120_000,
  );
});
