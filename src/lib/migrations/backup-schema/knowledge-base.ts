import { z } from "zod";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { htmlToDoc } from "@/lib/editor-v4";
import { mdToHtml } from "@/lib/editor-v4/migrate";
import { SafeHtml, SafeText, NumberWithDefault, StringArray } from "./helpers";

/**
 * Backups predating editor-v4 SSOT stored articles as raw markdown in
 * `content`. We accept that legacy input here and synthesize a canonical
 * `contentDoc` at parse-time. Newer backups carry `contentDoc` directly;
 * the legacy markdown field is no longer emitted into the rehydrated article.
 */
export const BackupKnowledgeBaseArticleSchema = z
  .object({
    id: z.string(),
    subjectId: SafeText,
    title: SafeHtml,
    content: SafeHtml.optional(),
    contentDoc: z.unknown().optional(),
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
    const incomingDoc = a.contentDoc as { version?: number; content?: unknown } | undefined;
    const isV4 = !!incomingDoc && incomingDoc.version === 4 && !!incomingDoc.content;
    const contentDoc = isV4
      ? (incomingDoc as KnowledgeBaseArticle["contentDoc"])
      : (a.content && a.content.trim().length > 0)
        ? htmlToDoc(mdToHtml(a.content))
        : { version: 4 as const, content: { type: "doc", content: [] } };
    return {
      id: a.id,
      subjectId: a.subjectId,
      title: a.title,
      contentDoc,
      linkedSourceIds: a.linkedSourceIds,
      rootSubcategoryId: typeof a.rootSubcategoryId === "string" ? a.rootSubcategoryId : undefined,
      isIndex: a.isIndex,
      tags: a.tags,
      aliases: a.aliases,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  });
