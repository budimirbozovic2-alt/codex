import { z } from "zod";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { SafeHtml, SafeText, NumberWithDefault, StringArray } from "./helpers";

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
