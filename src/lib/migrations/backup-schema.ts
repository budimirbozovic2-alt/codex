/**
 * Zod schemas for the backup/import payload.
 *
 * All HTML-bearing fields are sanitized via `.transform(sanitizeHtml)` so the
 * import path receives data that is safe to persist directly to IDB.
 *
 * Type safety: All schemas that map to database types now use `.strict()` to
 * reject unknown fields and prevent type holes via unsafe casting.
 *
 * Single source of truth: this file replaces the ad-hoc `typeof`/`as any`
 * sanitization that used to live in `useCardImport.ts`.
 */
import { z } from "zod";
import { sanitizeHtml } from "@/lib/sanitize";
import type { Card, Section } from "@/lib/spaced-repetition";
import type {
  CategoryRecord,
  SubcategoryNode,
  ChapterNode,
  Source,
  MindMapDoc,
  KnowledgeBaseArticle,
} from "@/lib/db-schema";
import type { MnemonicCard } from "@/features/mnemonic";

// ─── Primitive helpers ──────────────────────────────────
// All helpers are `.optional()` so missing fields don't trigger Zod v4
// "nonoptional" errors; the transform supplies the default.

/** Coerce a value to string and run it through DOMPurify. */
const SafeHtml = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? sanitizeHtml(v) : ""));

/** Plain string fallback (no HTML allowed — strip angle brackets). */
const SafeText = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "string" ? v.replace(/[<>]/g, "") : ""));

const NumberWithDefault = (def: number) =>
  z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : def));

const NullableNumber = z
  .unknown()
  .optional()
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

const StringArray = z
  .unknown()
  .optional()
  .transform((v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []));

const FrequencyTagInner = z
  .unknown()
  .optional()
  .transform((v) => (v === "često" || v === "rijetko" || v === "nikad" ? v : undefined));

const SourceTypeInner = z
  .unknown()
  .optional()
  .transform((v) => (v === "skripta" || v === "zakon" ? v : undefined));

// ─── FSRS Section ───────────────────────────────────────

export const BackupSectionSchema = z
  .object({
    id: z.unknown().optional().transform((v) => (typeof v === "string" && v.length > 0 ? v : crypto.randomUUID())),
    title: SafeText,
    content: SafeHtml,
    state: NumberWithDefault(0),
    stability: NumberWithDefault(0),
    difficulty: NumberWithDefault(5),
    interval: NumberWithDefault(0),
    nextReview: NumberWithDefault(0),
    lastReviewed: NullableNumber,
    lapses: NumberWithDefault(0),
    elapsedDays: NumberWithDefault(0),
    scheduledDays: NumberWithDefault(0),
    firstReviewPending: z.unknown().optional().transform((v) => (typeof v === "boolean" ? v : false)),
  })
  .strict();

// ─── Frequency / source enums ───────────────────────────

const FrequencyTagSchema = z
  .unknown()
  .optional()
  .transform((v) => (v === "često" || v === "rijetko" || v === "nikad" ? v : undefined));

const SourceTypeSchema = z
  .unknown()
  .optional()
  .transform((v) => (v === "skripta" || v === "zakon" ? v : undefined));

// ─── Card ────────────────────────────────────────────────

export const BackupCardSchema = z
  .object({
    id: z.string(),
    question: SafeHtml,
    sections: z.array(BackupSectionSchema).default([]),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    // Legacy backups stored these as `subcategory` / `chapter` (name strings).
    // Accept either spelling; the legacy-resolver later remaps names → UUIDs.
    subcategoryId: z.unknown().optional(),
    subcategory: z.unknown().optional(),
    chapterId: z.unknown().optional(),
    chapter: z.unknown().optional(),
    chapterOrder: z.unknown().optional(),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: z.unknown().optional(),
    readCount: NumberWithDefault(0),
    type: z.unknown().optional().transform((v) => (v === "flash" ? "flash" : "essay")),
    tags: StringArray,
    errorLog: z.unknown().optional().transform((v) => (Array.isArray(v) ? v : [])),
    sortOrder: z.unknown().optional(),
    sourceId: z.unknown().optional(),
    textAnchor: z.unknown().optional(),
    needsReview: z.unknown().optional(),
    keyParts: StringArray,
    originalSourceSnippet: z.unknown().optional(),
    childCardIds: StringArray,
    sourceModules: z.unknown().optional(),
    frequencyTag: FrequencyTagSchema,
    sourceType: SourceTypeSchema,
  })
  .strict()
  .transform((c): Card => {
    // Normalize legacy `subcategory` → `subcategoryId`, `chapter` → `chapterId`.
    const subId =
      typeof c.subcategoryId === "string" ? c.subcategoryId :
      typeof c.subcategory === "string" ? c.subcategory : "";
    const chapId =
      typeof c.chapterId === "string" ? c.chapterId :
      typeof c.chapter === "string" ? c.chapter : "";
    const out: Card = {
      id: c.id,
      question: c.question,
      sections: c.sections as unknown as Section[],
      categoryId: c.categoryId,
      subcategoryId: subId || undefined,
      chapterId: chapId || undefined,
      createdAt: c.createdAt,
      readCount: c.readCount,
      type: c.type,
      tags: c.tags,
      errorLog: c.errorLog as Card["errorLog"],
      keyParts: c.keyParts,
      childCardIds: c.childCardIds,
      frequencyTag: c.frequencyTag,
      sourceType: c.sourceType,
    };
    if (typeof c.updatedAt === "number") out.updatedAt = c.updatedAt;
    if (typeof c.chapterOrder === "number") out.chapterOrder = c.chapterOrder;
    if (typeof c.sortOrder === "number") out.sortOrder = c.sortOrder;
    if (typeof c.sourceId === "string") out.sourceId = c.sourceId;
    if (typeof c.textAnchor === "string") out.textAnchor = c.textAnchor;
    if (typeof c.needsReview === "boolean") out.needsReview = c.needsReview;
    if (typeof c.originalSourceSnippet === "string") out.originalSourceSnippet = c.originalSourceSnippet;
    if (Array.isArray(c.sourceModules)) out.sourceModules = c.sourceModules as Card["sourceModules"];
    return out;
  });

// ─── Chapter / Subcategory / Category ───────────────────

export const BackupChapterSchema: z.ZodType<ChapterNode> = z
  .object({
    id: z.string(),
    name: SafeText,
    sortOrder: NumberWithDefault(0),
  })
  .strict() as unknown as z.ZodType<ChapterNode>;

export const BackupSubcategorySchema: z.ZodType<SubcategoryNode> = z
  .object({
    id: z.string(),
    name: SafeText,
    sortOrder: NumberWithDefault(0),
    chapters: z.array(BackupChapterSchema).default([]),
  })
  .strict() as unknown as z.ZodType<SubcategoryNode>;

const ExaminerProfileSchema = z
  .object({
    difficulty: z.unknown().optional().transform((v) => (v === "tezak" || v === "lak" ? v : undefined)),
    preferredAnswerType: z.unknown().optional().transform((v) =>
      v === "esej" || v === "definicija" || v === "potpitanja" ? v : undefined,
    ),
    notes: SafeHtml.optional(),
    updatedAt: z.unknown().optional(),
  })
  .partial()
  .strict()
  .transform((p) => {
    const out: NonNullable<CategoryRecord["examinerProfile"]> = {};
    if (p.difficulty) out.difficulty = p.difficulty;
    if (p.preferredAnswerType) out.preferredAnswerType = p.preferredAnswerType;
    if (typeof p.notes === "string" && p.notes.length > 0) out.notes = p.notes;
    if (typeof p.updatedAt === "number") out.updatedAt = p.updatedAt;
    return Object.keys(out).length > 0 ? out : undefined;
  });

export const BackupCategoryRecordSchema = z
  .object({
    id: z.string(),
    name: SafeText,
    sortOrder: NumberWithDefault(0),
    subcategories: z.array(BackupSubcategorySchema).default([]),
    color: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
    examinerProfile: z.unknown().optional(),
  })
  .strict()
  .transform((c): CategoryRecord => {
    const out: CategoryRecord = {
      id: c.id,
      name: c.name,
      sortOrder: c.sortOrder,
      subcategories: c.subcategories,
    };
    if (c.color) out.color = c.color;
    if (c.examinerProfile !== undefined) {
      const profile = ExaminerProfileSchema.safeParse(c.examinerProfile);
      if (profile.success && profile.data) out.examinerProfile = profile.data;
    }
    return out;
  });

// ─── Sources ────────────────────────────────────────────

export const BackupSourceSchema = z
  .object({
    id: z.string(),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    title: SafeText,
    date: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    htmlContent: SafeHtml,
    outline: z.unknown().optional().transform((v) => (Array.isArray(v) ? v : [])),
    articles: z.unknown().optional().transform((v) => (Array.isArray(v) ? v : [])),
    version: NumberWithDefault(1),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
    officialGazetteInfo: z.unknown().optional(),
    slMarkings: z.unknown().optional(),
    isExclusive: z.unknown().optional(),
    sourceKind: z.unknown().optional(),
  })
  .strict()
  .transform((s): Source => {
    return {
      id: s.id,
      categoryId: s.categoryId,
      title: s.title,
      date: s.date,
      htmlContent: s.htmlContent,
      // PR-7b: legacy backup → synth empty AST; lazy-migrate fills on first load.
      contentDoc: { version: 4, content: { type: "doc", content: [] } },
      outline: s.outline as Source["outline"],
      articles: s.articles as Source["articles"],
      version: s.version,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      officialGazetteInfo: typeof s.officialGazetteInfo === "string" ? s.officialGazetteInfo : undefined,
      slMarkings: typeof s.slMarkings === "string" ? s.slMarkings : undefined,
      isExclusive: typeof s.isExclusive === "boolean" ? s.isExclusive : undefined,
      sourceKind: (s.sourceKind === "propis" || s.sourceKind === "skripta") ? s.sourceKind : undefined,
    };
  });

// ─── MindMap nodes/edges (with sanitized labels) ────────

const MindMapNodeSchema = z
  .object({
    id: z.string(),
    type: z.unknown().optional(),
    position: z.unknown().optional().transform((v) => (v && typeof v === "object" ? v : { x: 0, y: 0 })),
    data: z.unknown().optional().transform((v) => {
      if (!v || typeof v !== "object") return {};
      const obj = v as Record<string, unknown>;
      const out: Record<string, unknown> = { ...obj };
      if (typeof obj.label === "string") out.label = sanitizeHtml(obj.label);
      if (typeof obj.description === "string") out.description = sanitizeHtml(obj.description);
      return out;
    }),
    style: z.unknown().optional(),
  })
  .strict();

const MindMapEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
  })
  .strict();

export const BackupMindMapSchema = z
  .object({
    id: z.string(),
    categoryId: z.unknown().optional(),
    title: SafeText,
    mode: z.unknown().optional().transform((v) => (v === "procedure" ? "procedure" : "hierarchy")),
    nodes: z.array(MindMapNodeSchema).default([]),
    edges: z.array(MindMapEdgeSchema).default([]),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
  })
  .strict()
  .transform((m): MindMapDoc => {
    return {
      id: m.id,
      categoryId: typeof m.categoryId === "string" ? m.categoryId : "",
      title: m.title,
      mode: m.mode,
      nodes: m.nodes as MindMapDoc["nodes"],
      edges: m.edges as MindMapDoc["edges"],
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  });

// ─── Mnemonic ───────────────────────────────────────────

const MnemonicSectionSchema = z
  .object({ title: SafeText, content: SafeHtml })
  .strict();

export const BackupMnemonicSchema = z
  .object({
    id: z.string(),
    originalCardId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    question: SafeHtml,
    sections: z.array(MnemonicSectionSchema).default([]),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    subcategoryId: z.unknown().optional(),
    tags: StringArray,
    hookType: z.unknown().optional().transform((v) => (v === "rokovi" || v === "nabrajanja" || v === "ostalo" ? v : "ostalo")),
    hookMode: z.unknown().optional().transform((v) => (v === "video" || v === "acronym" ? v : "video")),
    mnemonicVideo: SafeText,
    acronym: SafeText,
    mnemonicStatus: z.unknown().optional().transform((v) => (v === "new" || v === "in-workshop" || v === "ready" ? v : "new")),
    createdAt: NumberWithDefault(Date.now()),
    testCount: NumberWithDefault(0),
    successCount: NumberWithDefault(0),
    failCount: NumberWithDefault(0),
    lastTested: NullableNumber,
  })
  .strict()
  .transform((m): MnemonicCard => {
    const out: MnemonicCard = {
      id: m.id,
      originalCardId: m.originalCardId,
      question: m.question,
      sections: m.sections as MnemonicCard["sections"],
      categoryId: m.categoryId,
      tags: m.tags,
      hookType: m.hookType,
      hookMode: m.hookMode,
      mnemonicVideo: m.mnemonicVideo,
      acronym: m.acronym,
      mnemonicStatus: m.mnemonicStatus,
      createdAt: m.createdAt,
      testCount: m.testCount,
      successCount: m.successCount,
      failCount: m.failCount,
      lastTested: m.lastTested,
    };
    if (typeof m.subcategoryId === "string") out.subcategoryId = m.subcategoryId;
    return out;
  });

// ─── Knowledge-base article ─────────────────────────────

export const BackupKnowledgeBaseArticleSchema = z
  .object({
    id: z.string(),
    subjectId: SafeText,
    title: SafeHtml,
    content: SafeHtml,
    linkedSourceIds: StringArray,
    rootSubcategoryId: z.unknown().optional(),
    isIndex: z.unknown().optional().transform((v) => v === true ? true : undefined),
    tags: StringArray,
    aliases: z.array(z.string()).optional(),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
  })
  .strict()
  .transform((a): KnowledgeBaseArticle => {
    return {
      id: a.id,
      subjectId: a.subjectId,
      title: a.title,
      content: a.content,
      // PR-7b: legacy backup → synth empty AST; lazy-migrate fills on first load.
      contentDoc: { version: 4, content: { type: "doc", content: [] } },
      linkedSourceIds: a.linkedSourceIds,
      rootSubcategoryId: typeof a.rootSubcategoryId === "string" ? a.rootSubcategoryId : undefined,
      isIndex: a.isIndex,
      tags: a.tags,
      aliases: a.aliases,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });

// ─── Settings entry (db.settings table: { key, value }) ─
export const BackupSettingsEntrySchema = z
  .object({ key: z.string(), value: z.unknown() })
  .strict();

// ─── Review log / SR settings ───────────────────────────

const ReasonSchema = z.object({ code: z.string(), label: z.string() }).strict();

export const BackupReviewLogEntrySchema = z
  .object({
    cardId: z.string(),
    sectionId: z.string().optional(),
    timestamp: NumberWithDefault(Date.now()),
    grade: NumberWithDefault(0),
    category: SafeText,
    reasons: z.array(ReasonSchema).optional(),
    effectiveRetention: z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
    intervalMultiplier: z.unknown().optional().transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)),
  })
  .strict();

const ResistanceWeightsSchema = z
  .object({
    lapses: z.number().finite(),
    latency: z.number().finite(),
    forgetting: z.number().finite(),
  })
  .strict();

export const BackupSRSettingsSchema = z
  .object({
    leechThreshold: z.number().finite().optional(),
    dailyGoal: z.number().finite().optional(),
    resistanceWeights: ResistanceWeightsSchema.optional(),
  })
  .strict();

// ─── Satellite log schemas (per-row strict) ─────────────

export const BackupDiarySchema = z
  .object({
    id: z.string(),
    date: SafeText,
    dailyGoal: SafeText,
    selfAnalysis: SafeText,
    createdAt: NumberWithDefault(Date.now()),
  })
  .strict();

export const BackupCalibrationSchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    cardId: z.string(),
    sectionId: SafeText,
    confidence: NumberWithDefault(0),
    actualGrade: NumberWithDefault(0),
    category: SafeText,
  })
  .strict();

export const BackupLatencySchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    cardId: z.string(),
    sectionId: SafeText,
    latencyMs: NumberWithDefault(0),
    category: SafeText,
  })
  .strict();

export const BackupSlippageSchema = z
  .object({
    date: SafeText,
    appEntryTime: NumberWithDefault(0),
    firstActionTime: NullableNumber,
    slippageMs: NullableNumber,
  })
  .strict();

export const BackupActivitySchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    type: z.unknown().transform((v) => (typeof v === "string" ? v : "admin")),
    durationMs: NumberWithDefault(0),
    category: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
  })
  .strict();

export const BackupDisciplineSchema = z
  .object({
    date: SafeText,
    status: z.unknown().transform((v) => (v === "diligent" || v === "neutral" || v === "lazy" ? v : "neutral")),
    planCompletion: NumberWithDefault(0),
    slippageMs: NullableNumber,
    reviewsDone: NumberWithDefault(0),
    suggestedReviews: NumberWithDefault(0),
  })
  .strict();

export const BackupPomodoroLogSchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    type: z.unknown().transform((v) => (v === "focus" || v === "break" ? v : "focus")),
    durationMinutes: NumberWithDefault(0),
  })
  .strict();

export const BackupMnemonicTestLogSchema = z
  .object({
    timestamp: NumberWithDefault(Date.now()),
    cardId: z.string(),
    success: z.unknown().transform((v) => v === true),
  })
  .strict();

export const BackupMajorSystemSchema = z
  .object({
    id: z.number().int().nonnegative(),
    peg: SafeText,
  })
  .strict();

/**
 * Per-item lenient parser: validates each row, drops invalid ones (logs in dev).
 * Used for satellite log arrays so one corrupt row doesn't abort the whole restore.
 */
function lenientArray<T extends z.ZodTypeAny>(schema: T, label: string) {
  return z
    .unknown()
    .optional()
    .transform((v): z.infer<T>[] => {
      if (!Array.isArray(v)) return [];
      const out: z.infer<T>[] = [];
      let dropped = 0;
      let firstErr: string | undefined;
      for (const raw of v) {
        const r = schema.safeParse(raw);
        if (r.success) {
          out.push(r.data);
        } else {
          dropped++;
          if (!firstErr) {
            const issue = r.error.issues[0];
            firstErr = `${issue?.path.join(".") || "(root)"} — ${issue?.message ?? ""}`;
          }
        }
      }
      if (dropped > 0 && typeof console !== "undefined") {
        console.warn(`[backup-schema] ${label}: dropped ${dropped} invalid row(s). First: ${firstErr}`);
      }
      return out;
    });
}


// ─── Top-level backup ───────────────────────────────────

export const BackupSchema = z
  .object({
    version: z.unknown().optional(),
    type: z.unknown().optional(),
    cards: z.array(BackupCardSchema).default([]),
    // Legacy backups had `categories: string[]` (names only). Accept either.
    categories: z
      .unknown()
      .transform((v): CategoryRecord[] | string[] => {
        if (!Array.isArray(v)) return [];
        if (v.length === 0) return [];
        const first = v[0];
        // New format: object with id+name → parse via BackupCategoryRecordSchema
        if (first && typeof first === "object" && "id" in first) {
          const out: CategoryRecord[] = [];
          for (const raw of v) {
            const r = BackupCategoryRecordSchema.safeParse(raw);
            if (r.success) out.push(r.data);
          }
          return out;
        }
        // Legacy format: array of name strings
        return v.filter((s): s is string => typeof s === "string");
      }),
    subcategories: z.unknown().optional(),
    reviewLog: lenientArray(BackupReviewLogEntrySchema, "reviewLog"),
    srSettings: z
      .unknown()
      .optional()
      .transform((v) => {
        if (v === undefined || v === null) return undefined;
        const r = BackupSRSettingsSchema.safeParse(v);
        return r.success ? r.data : undefined;
      }),
    sources: z.array(BackupSourceSchema).default([]),
    mindMaps: z.array(BackupMindMapSchema).default([]),
    diary: lenientArray(BackupDiarySchema, "diary"),
    calibrationLog: lenientArray(BackupCalibrationSchema, "calibrationLog"),
    latencyLog: lenientArray(BackupLatencySchema, "latencyLog"),
    slippageLog: lenientArray(BackupSlippageSchema, "slippageLog"),
    activityLog: lenientArray(BackupActivitySchema, "activityLog"),
    disciplineLog: lenientArray(BackupDisciplineSchema, "disciplineLog"),
    pomodoroLog: lenientArray(BackupPomodoroLogSchema, "pomodoroLog"),
    mnemonics: z.array(BackupMnemonicSchema).default([]),
    majorSystem: lenientArray(BackupMajorSystemSchema, "majorSystem"),
    mnemonicTestLog: lenientArray(BackupMnemonicTestLogSchema, "mnemonicTestLog"),
    knowledgeBaseArticles: z.array(BackupKnowledgeBaseArticleSchema).default([]),
    settings: z.array(BackupSettingsEntrySchema).default([]),
    localStorageData: z.unknown().optional(),
  })
  .passthrough();

export type ParsedBackup = z.infer<typeof BackupSchema>;
export type ParsedCard = z.infer<typeof BackupCardSchema>;
export type ParsedCategoryRecord = z.infer<typeof BackupCategoryRecordSchema>;

// ─── Legacy minimal-backup shape (used by remap migrations) ─────

export interface BackupChap {
  id: string;
  name: string;
}

export interface BackupSub {
  id: string;
  name: string;
  chapters?: BackupChap[];
}

export interface BackupCategory {
  id: string;
  name: string;
  subcategories?: BackupSub[];
}

export interface BackupCard {
  id: string;
  categoryId?: string;
  subcategoryId?: string;
  chapterId?: string;
}

export interface MinimalBackup {
  categories: BackupCategory[];
  cards: BackupCard[];
  type?: string;
  version?: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isMinimalBackup(json: unknown): json is MinimalBackup {
  if (!isObj(json)) return false;
  if (!Array.isArray(json.categories) || !Array.isArray(json.cards)) return false;
  if (json.categories.length > 0) {
    const c = json.categories[0];
    if (!isObj(c) || typeof c.id !== "string" || typeof c.name !== "string") return false;
  }
  if (json.cards.length > 0) {
    const c = json.cards[0];
    if (!isObj(c) || typeof c.id !== "string") return false;
  }
  return true;
}

export function normalizeName(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Strict type-guard wrapper around `BackupSchema.safeParse`.
 *
 * `useCardImport` calls `safeParse` directly so it can surface per-field error
 * paths in toasts. This export exists for callers that just need a boolean
 * predicate (drag-and-drop dropzones, restore preview, tests).
 */
export function isValidBackupPayload(data: unknown): data is ParsedBackup {
  return BackupSchema.safeParse(data).success;
}
