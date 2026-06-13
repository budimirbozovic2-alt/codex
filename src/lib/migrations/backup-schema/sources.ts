import { z } from "zod";
import type { Source } from "@/lib/db-types";
import { SafeText, NumberWithDefault, EditorDocV4 } from "./helpers";

export const BackupSourceSchema = z
  .object({
    id: z.string(),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    title: SafeText,
    date: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    contentDoc: EditorDocV4,
    outline: z.unknown().optional().transform((v) => (Array.isArray(v) ? v : [])),
    articles: z.unknown().optional().transform((v) => (Array.isArray(v) ? v : [])),
    version: NumberWithDefault(1),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
    officialGazetteInfo: z.unknown().optional(),
    slMarkings: z.unknown().optional(),
    isExclusive: z.unknown().optional(),
    sourceKind: z.unknown().optional(),
    examQuestions: z.unknown().optional().transform((v) => (Array.isArray(v) ? v : [])),
  })
  .strict()
  .transform((s): Source => ({
    id: s.id,
    categoryId: s.categoryId,
    title: s.title,
    date: s.date,
    contentDoc: s.contentDoc,
    outline: s.outline as Source["outline"],
    articles: s.articles as Source["articles"],
    version: s.version,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    officialGazetteInfo: typeof s.officialGazetteInfo === "string" ? s.officialGazetteInfo : undefined,
    slMarkings: typeof s.slMarkings === "string" ? s.slMarkings : undefined,
    isExclusive: typeof s.isExclusive === "boolean" ? s.isExclusive : undefined,
    sourceKind: (s.sourceKind === "propis" || s.sourceKind === "skripta") ? s.sourceKind : undefined,
    examQuestions: s.examQuestions as Source["examQuestions"],
  }));
