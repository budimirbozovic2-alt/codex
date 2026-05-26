import { describe, it, expect } from "vitest";
import { BackupSchema, BackupCardSchema, BackupCategoryRecordSchema } from "@/lib/migrations/backup-schema";
import { migrateRaw, BackupVersionError, BACKUP_SCHEMA_VERSION } from "@/lib/backup/migrate";

describe("migrateRaw (pre-Zod migration)", () => {
  it("injects empty `settings` for v5 backups", () => {
    const out = migrateRaw({ version: 5, type: "full", cards: [], categories: [] }) as Record<string, unknown>;
    expect(Array.isArray(out.settings)).toBe(true);
    expect((out.settings as unknown[]).length).toBe(0);
    expect(out.version).toBe(BACKUP_SCHEMA_VERSION);
  });

  it("injects empty `knowledgeBaseArticles` for v6 backups", () => {
    const out = migrateRaw({ version: 6, type: "full", cards: [], categories: [] }) as Record<string, unknown>;
    expect(Array.isArray(out.knowledgeBaseArticles)).toBe(true);
  });

  it("throws BackupVersionError for backups newer than the app", () => {
    expect(() => migrateRaw({ version: 999, cards: [], categories: [] })).toThrow(BackupVersionError);
  });

  it("is idempotent — running twice produces the same shape", () => {
    const once = migrateRaw({ version: 5, type: "full", cards: [], categories: [] });
    const twice = migrateRaw(once);
    expect(twice).toEqual(once);
  });

  it("preserves existing fields untouched", () => {
    const settings = [{ key: "x", value: 1 }];
    const out = migrateRaw({ version: 6, cards: [], categories: [], settings }) as Record<string, unknown>;
    expect(out.settings).toBe(settings);
  });
});

describe("BackupSchema", () => {
  it("parses a minimal valid v6 backup with empty arrays", () => {
    const result = BackupSchema.safeParse({ version: 6, type: "full", cards: [], categories: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.cards).toEqual([]);
      expect(result.data.sources).toEqual([]);
      expect(result.data.mindMaps).toEqual([]);
      expect(result.data.knowledgeBaseArticles).toEqual([]);
    }
  });

  it("preserves unknown top-level fields via passthrough", () => {
    const result = BackupSchema.safeParse({
      version: 3,
      type: "full",
      cards: [],
      categories: [],
      legacyField: "should not break parse",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payload where cards[0].sections is not an array", () => {
    const result = BackupSchema.safeParse({
      version: 6,
      cards: [{ id: "c1", question: "q", sections: "not an array", categoryId: "cat1" }],
      categories: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload that is not an object at all", () => {
    expect(BackupSchema.safeParse(null).success).toBe(false);
    expect(BackupSchema.safeParse("string").success).toBe(false);
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

  it("strips invalid sourceType instead of throwing", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1", question: "Q", sections: [], categoryId: "cat1", type: "essay",
      sourceType: "bogus",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sourceType).toBeUndefined();
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
      expect(result.data.question).not.toContain("alert");
      expect(result.data.question).toContain("safe");
      expect(result.data.question).toContain("text");
    }
  });

  it("sanitizes XSS in card sections content", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ id: "s1", title: "T", content: '<img src=x onerror="alert(1)">body' }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const content = (result.data.sections[0] as unknown as { content: string }).content;
      expect(content).not.toContain("onerror");
    }
  });

  it("sanitizes mindMap node label via .transform", () => {
    const result = BackupSchema.safeParse({
      cards: [],
      categories: [],
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
      const node = result.data.mindMaps[0].nodes[0];
      const label = (node.data as Record<string, unknown>).label as string;
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
      expect(result.data.examinerProfile.difficulty).toBe("tezak");
      expect(result.data.examinerProfile.notes ?? "").not.toContain("<script>");
    }
  });

  it("drops invalid examiner enum values silently", () => {
    const result = BackupCategoryRecordSchema.safeParse({
      id: "cat1",
      name: "X",
      sortOrder: 0,
      subcategories: [],
      examinerProfile: { difficulty: "INVALID", preferredAnswerType: "BOGUS" },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.examinerProfile).toBeUndefined();
    }
  });

  it("normalizes legacy `subcategory`/`chapter` (name strings) into `subcategoryId`/`chapterId`", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [],
      categoryId: "cat1",
      type: "essay",
      subcategory: "Imovinska krivična djela",
      chapter: "Krađa",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subcategoryId).toBe("Imovinska krivična djela");
      expect(result.data.chapterId).toBe("Krađa");
    }
  });

  it("auto-generates section id when missing", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ title: "T", content: "C" }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sections[0].id).toBeTruthy();
      expect(typeof result.data.sections[0].id).toBe("string");
    }
  });

  it("accepts legacy `categories: string[]` (name-only) format", () => {
    const result = BackupSchema.safeParse({
      version: 1,
      cards: [],
      categories: ["Krivično pravo", "Građansko pravo"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data.categories)).toBe(true);
      expect(result.data.categories).toEqual(["Krivično pravo", "Građansko pravo"]);
    }
  });

  it("applies FSRS defaults for missing section fields", () => {
    const result = BackupCardSchema.safeParse({
      id: "c1",
      question: "Q",
      sections: [{ id: "s1", title: "T", content: "C" }],
      categoryId: "cat1",
      type: "essay",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const s = result.data.sections[0];
      expect(s.state).toBe(0);
      expect(s.stability).toBe(0);
      expect(s.difficulty).toBe(5);
      expect(s.lapses).toBe(0);
      expect(s.lastReviewed).toBeNull();
    }
  });
});

describe("Strict satellite log schemas (lenient array filter)", () => {
  it("drops invalid log rows but keeps valid ones", () => {
    const result = BackupSchema.safeParse({
      version: BACKUP_SCHEMA_VERSION,
      cards: [],
      categories: [],
      pomodoroLog: [
        { timestamp: 1, type: "focus", durationMinutes: 25 },
        { timestamp: "bad", type: "focus", durationMinutes: 25 }, // ts wrong type → coerced to default
        "totally bogus",                                          // dropped (not an object)
        { timestamp: 2, type: "break", durationMinutes: 5, extra: "nope" }, // strict reject
      ],
      disciplineLog: [
        { date: "2026-05-23", status: "diligent", planCompletion: 1, slippageMs: null, reviewsDone: 10, suggestedReviews: 10 },
        null, // dropped
      ],
      activityLog: [{ timestamp: 1, type: "review", durationMs: 1000 }],
      latencyLog: [{ timestamp: 1, cardId: "c1", sectionId: "s1", latencyMs: 100, category: "A" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    // Two valid pomodoro rows (the "extra" one is strict-rejected; the "bogus" string dropped)
    expect(result.data.pomodoroLog.length).toBe(2);
    expect(result.data.disciplineLog.length).toBe(1);
    expect(result.data.activityLog.length).toBe(1);
    expect(result.data.latencyLog.length).toBe(1);
  });

  it("accepts review log entries with full FSRS metadata", () => {
    const result = BackupSchema.safeParse({
      version: BACKUP_SCHEMA_VERSION,
      cards: [],
      categories: [],
      reviewLog: [
        {
          cardId: "c1",
          sectionId: "s1",
          timestamp: 123,
          grade: 3,
          category: "Krivično",
          reasons: [{ code: "leech", label: "Leech" }],
          effectiveRetention: 0.9,
          intervalMultiplier: 1.2,
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reviewLog.length).toBe(1);
  });

  it("parses srSettings strictly and falls back to undefined on malformed input", () => {
    const ok = BackupSchema.safeParse({
      version: BACKUP_SCHEMA_VERSION, cards: [], categories: [],
      srSettings: { leechThreshold: 5, dailyGoal: 20, resistanceWeights: { lapses: 1, latency: 1, forgetting: 1 } },
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.srSettings?.dailyGoal).toBe(20);

    const bad = BackupSchema.safeParse({
      version: BACKUP_SCHEMA_VERSION, cards: [], categories: [],
      srSettings: { leechThreshold: "five", resistanceWeights: "nope" },
    });
    expect(bad.success).toBe(true);
    if (bad.success) expect(bad.data.srSettings).toBeUndefined();
  });
});
