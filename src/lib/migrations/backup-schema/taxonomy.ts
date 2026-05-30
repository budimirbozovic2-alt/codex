import { z } from "zod";
import type {
  CategoryRecord,
  SubcategoryNode,
  ChapterNode,
} from "@/lib/db-types";
import { SafeHtml, SafeText, NumberWithDefault } from "./helpers";

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
