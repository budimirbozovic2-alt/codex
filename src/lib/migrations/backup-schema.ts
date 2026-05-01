/**
 * Zod schemas for the backup/import payload.
 *
 * All HTML-bearing fields are sanitized via `.transform(sanitizeHtml)` so the
 * import path receives data that is safe to persist directly to IDB. Unknown
 * fields are preserved (`.passthrough()`) so legacy backups never get rejected
 * just because the schema evolved.
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
import type { MnemonicCard } from "@/lib/mnemonic-storage";

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
  .passthrough();

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
  .passthrough()
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
  .passthrough() as unknown as z.ZodType<ChapterNode>;

export const BackupSubcategorySchema: z.ZodType<SubcategoryNode> = z
  .object({
    id: z.string(),
    name: SafeText,
    sortOrder: NumberWithDefault(0),
    chapters: z.array(BackupChapterSchema).default([]),
  })
  .passthrough() as unknown as z.ZodType<SubcategoryNode>;

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
  .passthrough()
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
  .passthrough()
  .transform((s): Source => s as unknown as Source);

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
  .passthrough();

const MindMapEdgeSchema = z
  .object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
  })
  .passthrough();

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
  .passthrough()
  .transform((m): MindMapDoc => m as unknown as MindMapDoc);

// ─── Mnemonic ───────────────────────────────────────────

export const BackupMnemonicSchema = z
  .object({
    id: z.string(),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
  })
  .passthrough()
  .transform((m): MnemonicCard => m as unknown as MnemonicCard);

// ─── Knowledge-base article ─────────────────────────────

export const BackupKnowledgeBaseArticleSchema = z
  .object({
    id: z.string(),
    subjectId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    title: SafeHtml,
    content: SafeHtml,
    linkedSourceIds: StringArray,
    rootSubcategoryId: z.unknown().optional(),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
  })
  .passthrough()
  .transform((a): KnowledgeBaseArticle => a as unknown as KnowledgeBaseArticle);

// ─── Review log / SR settings ───────────────────────────

export const BackupReviewLogEntrySchema = z
  .object({
    cardId: z.string(),
    sectionId: z.string().optional(),
    timestamp: NumberWithDefault(Date.now()),
  })
  .passthrough();

export const BackupSRSettingsSchema = z
  .object({
    leechThreshold: z.unknown().optional(),
    dailyGoal: z.unknown().optional(),
    resistanceWeights: z.unknown().optional(),
  })
  .passthrough();

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
    reviewLog: z.array(BackupReviewLogEntrySchema).default([]),
    srSettings: z.unknown().optional(),
    sources: z.array(BackupSourceSchema).default([]),
    mindMaps: z.array(BackupMindMapSchema).default([]),
    diary: z.array(z.unknown()).default([]),
    calibrationLog: z.array(z.unknown()).default([]),
    latencyLog: z.array(z.unknown()).default([]),
    slippageLog: z.array(z.unknown()).default([]),
    activityLog: z.array(z.unknown()).default([]),
    disciplineLog: z.array(z.unknown()).default([]),
    pomodoroLog: z.array(z.unknown()).default([]),
    mnemonics: z.array(BackupMnemonicSchema).default([]),
    majorSystem: z.array(z.unknown()).default([]),
    mnemonicTestLog: z.array(z.unknown()).default([]),
    knowledgeBaseArticles: z.array(BackupKnowledgeBaseArticleSchema).default([]),
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
