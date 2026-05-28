/**
 * PR-7f M3g — Zettelkasten read-path on TanStack Query.
 *
 * Replaces the legacy `useState + useEffect + listener` pattern in
 * `useZettelkastenBootstrap`. Invalidation flows automatically via
 * `bridges.ts` (`onKnowledgeBaseChanged → invalidateQueries(['knowledgeBase'])`).
 *
 * Two flavours:
 *  - `useKnowledgeBaseArticlesBySubject(subjectId)` — primary view scope,
 *    keyed on `queryKeys.knowledgeBase.byCategory(subjectId)`.
 *  - `useAllKnowledgeBaseArticles()` — unscoped (backup / health),
 *    keyed on `queryKeys.knowledgeBase.all()`.
 */
import { useQuery } from "@tanstack/react-query";
import {
  loadArticlesBySubject,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import {
  listAllArticles,
  listArticleHeadersBySubject,
  type KnowledgeBaseArticleHeader,
} from "@/lib/db/queries/knowledge-base";
import { queryKeys } from "@/lib/query/keys";

const EMPTY: KnowledgeBaseArticle[] = [];
const EMPTY_HEADERS: KnowledgeBaseArticleHeader[] = [];

export function useKnowledgeBaseArticlesBySubject(
  subjectId: string | undefined,
): { data: KnowledgeBaseArticle[]; isLoading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: subjectId
      ? queryKeys.knowledgeBase.byCategory(subjectId)
      : ["knowledgeBase", "cat", "__none__"],
    queryFn: () => loadArticlesBySubject(subjectId as string),
    enabled: !!subjectId,
  });
  return { data: data ?? EMPTY, isLoading: !!subjectId && isPending };
}

export function useAllKnowledgeBaseArticles(enabled: boolean = true): KnowledgeBaseArticle[] {
  const { data } = useQuery({
    queryKey: queryKeys.knowledgeBase.all(),
    queryFn: () => listAllArticles(),
    enabled,
  });
  return data ?? EMPTY;
}
