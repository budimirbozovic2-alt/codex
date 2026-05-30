import { z } from "zod";
import type { Source } from "@/lib/db-types";
import { SafeHtml, SafeText, NumberWithDefault } from "./helpers";

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
