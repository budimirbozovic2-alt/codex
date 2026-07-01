import { z } from "zod";
import type { Card, Section } from "@/lib/spaced-repetition";
import {
  SafeHtml,
  SafeText,
  NumberWithDefault,
  NullableNumber,
  StringArray,
  FrequencyTagSchema,
  SourceTypeSchema,
  EditorDocV4,
} from "./helpers";

// ─── FSRS Section ───────────────────────────────────────

const BackupSectionSchema = z
  .object({
    id: z.unknown().optional().transform((v) => (typeof v === "string" && v.length > 0 ? v : crypto.randomUUID())),
    title: SafeText,
    contentDoc: EditorDocV4,
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
  .strict()
  .transform((s): Section => ({
    id: s.id,
    title: s.title,
    contentDoc: s.contentDoc,
    state: s.state,
    stability: s.stability,
    difficulty: s.difficulty,
    interval: s.interval,
    nextReview: s.nextReview,
    lastReviewed: s.lastReviewed,
    lapses: s.lapses,
    elapsedDays: s.elapsedDays,
    scheduledDays: s.scheduledDays,
    firstReviewPending: s.firstReviewPending,
  }));

// ─── Card ────────────────────────────────────────────────

export const BackupCardSchema = z
  .object({
    id: z.string(),
    question: SafeHtml,
    sections: z.array(BackupSectionSchema).default([]),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    subcategoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
    chapterId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : undefined)),
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
    parentId: z.unknown().optional().transform((v) => (typeof v === "string" && v.length > 0 ? v : undefined)),
    isEndangered: z.unknown().optional().transform((v) => (typeof v === "boolean" ? v : undefined)),
    linkedArticleId: z.unknown().optional().transform((v) => (typeof v === "string" && v.length > 0 ? v : undefined)),
  })
  .strict()
  .transform((c): Card => {
    const out: Card = {
      id: c.id,
      question: c.question,
      sections: c.sections,
      categoryId: c.categoryId,
      subcategoryId: c.subcategoryId,
      chapterId: c.chapterId,
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
    if (typeof c.parentId === "string") out.parentId = c.parentId;
    if (typeof c.isEndangered === "boolean") out.isEndangered = c.isEndangered;
    if (typeof c.linkedArticleId === "string") out.linkedArticleId = c.linkedArticleId;
    return out;
  });
