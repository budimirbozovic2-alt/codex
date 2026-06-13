import { z } from "zod";
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { SafeHtml, SafeText, NumberWithDefault, StringArray, EditorDocV4 } from "./helpers";

export const BackupKnowledgeBaseArticleSchema = z
  .object({
    id: z.string(),
    subjectId: SafeText,
    title: SafeHtml,
    contentDoc: EditorDocV4,
    linkedSourceIds: StringArray,
    rootSubcategoryId: z.unknown().optional(),
    isIndex: z.unknown().optional().transform((v) => (v === true ? true : undefined)),
    tags: StringArray,
    aliases: z.array(z.string()).optional(),
    createdAt: NumberWithDefault(Date.now()),
    updatedAt: NumberWithDefault(Date.now()),
  })
  .strict()
  .transform((a): KnowledgeBaseArticle => ({
    id: a.id,
    subjectId: a.subjectId,
    title: a.title,
    contentDoc: a.contentDoc,
    linkedSourceIds: a.linkedSourceIds,
    rootSubcategoryId: typeof a.rootSubcategoryId === "string" ? a.rootSubcategoryId : undefined,
    isIndex: a.isIndex,
    tags: a.tags,
    aliases: a.aliases,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
