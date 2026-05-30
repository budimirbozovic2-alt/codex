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
} from "./helpers";

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
