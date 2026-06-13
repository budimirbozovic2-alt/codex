/**
 * KB article test fixtures aligned with contentDoc SSOT.
 * Builds v4 EditorDoc bodies from zettelkasten-flavoured markdown strings.
 */
import type { KnowledgeBaseArticle } from "@/lib/db-types";
import { newArticle } from "@/domains/zettelkasten/zettelkasten-storage";
import { htmlToDoc } from "@/lib/editor-v4";
import { mdToHtml } from "@/lib/editor-v4/migrate";

export function kbArticleFromMarkdown(
  subjectId: string,
  title: string,
  markdown = "",
  opts?: Partial<
    Pick<KnowledgeBaseArticle, "id" | "aliases" | "isIndex" | "linkedSourceIds" | "subjectId">
  >,
): KnowledgeBaseArticle {
  const base = newArticle(subjectId, title);
  return {
    ...base,
    ...opts,
    id: opts?.id ?? base.id,
    subjectId: opts?.subjectId ?? subjectId,
    linkedSourceIds: opts?.linkedSourceIds ?? [],
    contentDoc: markdown.trim()
      ? htmlToDoc(mdToHtml(markdown))
      : base.contentDoc,
  };
}

/** Simulates a pre-v22 SQLite row: markdown body, no contentDoc in payload. */
export function legacyKbArticlePayload(
  subjectId: string,
  title: string,
  markdown: string,
): KnowledgeBaseArticle {
  const base = newArticle(subjectId, title);
  const row = { ...base, content: markdown } as KnowledgeBaseArticle & { content: string };
  delete (row as { contentDoc?: unknown }).contentDoc;
  return row as KnowledgeBaseArticle;
}
