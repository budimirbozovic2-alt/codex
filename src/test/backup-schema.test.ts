import { describe, it, expect } from "vitest";
import { BackupSchema, BackupCardSchema, BackupCategoryRecordSchema } from "@/lib/migrations/backup-schema";
import { assertBackupVersion, BackupVersionError, BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";
import { deriveHtml } from "@/lib/editor-v4/derived";

const EMPTY_DOC = { version: 4 as const, content: { type: "doc", content: [] } };

function minimalBackup(overrides: Record<string, unknown> = {}) {
  return {
    version: BACKUP_SCHEMA_VERSION,
    type: "full",
    cards: [],
    categories: [],
    sources: [],
    mindMaps: [],
    knowledgeBaseArticles: [],
    settings: [],
    ...overrides,
  };
}

describe("assertBackupVersion (v7 gate)", () => {
  it("accepts v7 backups", () => {
    expect(() => assertBackupVersion(minimalBackup())).not.toThrow();
  });

  it("rejects backups newer than the app", () => {
    expect(() => assertBackupVersion({ version: 999, cards: [], categories: [] }))
      .toThrow(BackupVersionError);
  });

  it("rejects legacy v5/v6 backups with a clear message", () => {
    expect(() => assertBackupVersion({ version: 5, type: "full", cards: [], categories: [] }))
      .toThrow(/zastarjelom formatu/);
    expect(() => assertBackupVersion({ version: 6, type: "full", cards: [], categories: [] }))
      .toThrow(/zastarjelom formatu/);
  });

  it("rejects backups without a version marker", () => {
    expect(() => assertBackupVersion({ cards: [], categories: [] }))
      .toThrow(BackupVersionError);
  });
});

describe("BackupSchema (v7)", () => {
  it("parses a minimal valid v7 backup with empty arrays", () => {
    const result = BackupSchema.safeParse(minimalBackup());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cards).toEqual([]);
      expect(result.data.sources).toEqual([]);
      expect(result.data.mindMaps).toEqual([]);
      expect(result.data.knowledgeBaseArticles).toEqual([]);
    }
  });

  it("rejects unknown top-level fields (strict schema)", () => {
    const result = BackupSchema.safeParse({
      ...minimalBackup(),
      legacyField: "should not break parse",
    });
    expect(result.success).toBe(false);
  });

  it("rejects legacy v6 version marker", () => {
    const result = BackupSchema.safeParse({
      version: 6,
      type: "full",
      cards: [],
      categories: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload where cards[0].sections is not an array", () => {
    const result = BackupSchema.safeParse({
      ...minimalBackup(),
      cards: [{ id: "c1", question: "q", sections: "not an array", categoryId: "cat1" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload that is not an object at all", () => {
    expect(BackupSchema.safeParse(null).success).toBe(false);
    expect(BackupSchema.safeParse("string").success).toBe(false);
  });

  it("rejects legacy `categories: string[]` format", () => {
    const result = BackupSchema.safeParse({
      ...minimalBackup(),
      categories: ["Krivično pravo", "Građansko pravo"],
    });
    expect(result.success).toBe(false);
  });

  it("strips invalid frequencyTag instead of throwing", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [],
      categoryId: "cat1",
      type: "essay",
      frequencyTag: "INVALID_VALUE",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frequencyTag).toBeUndefined();
    }
  });

  it("sanitizes XSS in card question via DOMPurify transform", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: 'safe<script>alert("xss")</script>text',
      sections: [],
      categoryId: "cat1",
      type: "essay",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.question).not.toContain("<script>");
      expect(result.data.question).toContain("safe");
    }
  });

  it("requires contentDoc on sections (no legacy HTML `content` field)", () => {
    const withLegacy = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ id: "s1", title: "T", content: "body" }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(withLegacy.success).toBe(false);

    const withDoc = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ id: "s1", title: "T", contentDoc: EMPTY_DOC }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(withDoc.success).toBe(true);
  });

  it("auto-generates section id when missing", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ title: "T", contentDoc: EMPTY_DOC }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections[0].id).toBeTruthy();
    }
  });

  it("applies FSRS defaults for missing section fields", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ id: "s1", title: "T", contentDoc: EMPTY_DOC }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const s = result.data.sections[0];
      expect(s.state).toBe(0);
      expect(s.difficulty).toBe(5);
      expect(s.lastReviewed).toBeNull();
    }
  });

  it("sanitizes mindMap node label via .transform", () => {
    const result = BackupSchema.safeParse({
      ...minimalBackup(),
      mindMaps: [{
        id: "mm1",
        title: "Map",
        mode: "hierarchy",
        nodes: [{ id: "n1", position: { x: 0, y: 0 }, data: { label: '<img onerror=alert(1)>x' } }],
        edges: [],
      }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const label = (result.data.mindMaps[0].nodes[0].data as Record<string, unknown>).label as string;
      expect(label).not.toContain("onerror");
    }
  });

  it("sanitizes examiner profile notes when present", () => {
    const result = BackupCategoryRecordSchema.safeParse({
      id: "cat1",
      name: "Krivično",
      sortOrder: 0,
      subcategories: [],
      examinerProfile: {
        difficulty: "tezak",
        notes: '<script>alert(1)</script>safe',
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.examinerProfile) {
      expect(result.data.examinerProfile.notes ?? "").not.toContain("<script>");
    }
  });
});

describe("Strict satellite log schemas (lenient array filter)", () => {
  it("drops invalid log rows but keeps valid ones", () => {
    const result = BackupSchema.safeParse({
      ...minimalBackup(),
      pomodoroLog: [
        { timestamp: 1, type: "focus", durationMinutes: 25 },
        { timestamp: "bad", type: "focus", durationMinutes: 25 },
        "totally bogus",
        { timestamp: 2, type: "break", durationMinutes: 5, extra: "nope" },
      ],
      disciplineLog: [
        { date: "2026-05-23", status: "diligent", planCompletion: 1, slippageMs: null, reviewsDone: 10, suggestedReviews: 10 },
        null,
      ],
      activityLog: [{ timestamp: 1, type: "review", durationMs: 1000 }],
      latencyLog: [{ timestamp: 1, cardId: "c1", sectionId: "s1", latencyMs: 100, category: "A" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.pomodoroLog.length).toBe(2);
    expect(result.data.disciplineLog.length).toBe(1);
  });
});
