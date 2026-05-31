/**
 * Pure derived selectors over the in-memory article list.
 *
 * Title sets are deliberately empty while editing — the preview is unmounted
 * during edit, so wasted work during typing bursts (and concurrent wiki-link
 * auto-create batches) is avoided.
 */
import { useMemo } from "react";
import type { KnowledgeBaseArticle } from "@/lib/zettelkasten-storage";

interface Input {
  articles: KnowledgeBaseArticle[];
  activeId: string | null;
  isEditing: boolean;
}

interface Result {
  activeArticle: KnowledgeBaseArticle | null;
  existingTitleSet: Set<string>;
  emptyTitleSet: Set<string>;
}

export function useArticleIndex({ articles, activeId, isEditing }: Input): Result {
  const activeArticle = useMemo(
    () => articles.find(a => a.id === activeId) ?? null,
    [articles, activeId],
  );

  const existingTitleSet = useMemo(() => {
    if (isEditing) return new Set<string>();
    const set = new Set<string>();
    for (const a of articles) {
      set.add(a.title.trim().toLowerCase());
      if (Array.isArray(a.aliases)) {
        for (const alias of a.aliases) set.add(alias.trim().toLowerCase());
      }
    }
    return set;
  }, [articles, isEditing]);

  const emptyTitleSet = useMemo(() => {
    if (isEditing) return new Set<string>();
    const set = new Set<string>();
    for (const a of articles) {
      if (!isDocEmpty(a.contentDoc)) continue;
      set.add(a.title.trim().toLowerCase());
      if (Array.isArray(a.aliases)) {
        for (const alias of a.aliases) set.add(alias.trim().toLowerCase());
      }
    }
    return set;
  }, [articles, isEditing]);

  return { activeArticle, existingTitleSet, emptyTitleSet };
}
