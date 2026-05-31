import { z } from "zod";
import type { Source } from "@/lib/db-types";
import { htmlToDoc } from "@/lib/editor-v4";
import { SafeHtml, SafeText, NumberWithDefault } from "./helpers";

/**
 * Backups predating editor-v4 SSOT stored source bodies as raw HTML in
 * `htmlContent`. We accept that legacy input here and synthesize a canonical
 * `contentDoc` at parse-time so the field can be dropped from the runtime
 * `Source` shape entirely. Newer backups carry `contentDoc` directly; the
 * legacy field is no longer emitted into the rehydrated Source.
 */
export const BackupSourceSchema = z
  .object({
    id: z.string(),
    categoryId: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    title: SafeText,
    date: z.unknown().optional().transform((v) => (typeof v === "string" ? v : "")),
    htmlContent: SafeHtml.optional(),
    contentDoc: z.unknown().optional(),
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
    const incomingDoc = s.contentDoc as { version?: number; content?: unknown } | undefined;
    const isV4 = !!incomingDoc && incomingDoc.version === 4 && !!incomingDoc.content;
    const contentDoc = isV4
      ? (incomingDoc as Source["contentDoc"])
      : (s.htmlContent && s.htmlContent.trim().length > 0)
        ? htmlToDoc(s.htmlContent)
        : { version: 4 as const, content: { type: "doc", content: [] } };
    return {
      id: s.id,
      categoryId: s.categoryId,
      title: s.title,
      date: s.date,
      contentDoc,
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
