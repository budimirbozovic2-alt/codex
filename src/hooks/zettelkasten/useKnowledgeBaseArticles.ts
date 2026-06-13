/**
 * PR-7f M3g — Zettelkasten read-path on TanStack Query.
 *
 * Replaces the legacy `useState + useEffect + listener` pattern in
 * `useZettelkastenBootstrap`. Invalidation flows automatically via
 * `bridges.ts` (`domain:changed{zettelkasten} → invalidateQueries(['knowledgeBase'])`).
 *
 * Two flavours:
 *  - `useKnowledgeBaseArticlesBySubject(subjectId)` — primary view scope,
 *    keyed on `queryKeys.knowledgeBase.byCategory(subjectId)`.
 */
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  loadArticlesBySubject,
  loadAllArticles,
  type KnowledgeBaseArticle,
} from "@/domains/zettelkasten/zettelkasten-storage";
import { queryKeys } from "@/lib/query/keys";

const EMPTY: KnowledgeBaseArticle[] = [];

export function useKnowledgeBaseArticlesBySubject(
  subjectId: string | undefined,
): { data: KnowledgeBaseArticle[]; isLoading: boolean } {
  const { data, isPending } = useQuery({
    queryKey: subjectId
      ? queryKeys.knowledgeBase.bySubject(subjectId)
      : ["knowledgeBase", "cat", "__none__"],
    queryFn: () => loadArticlesBySubject(subjectId as string),
    enabled: !!subjectId,
    // C1 — keep previous subject's data visible while the next subject's
    // query is fetching, so swapping in Zettel doesn't flash empty.
    placeholderData: keepPreviousData,
  });
  return { data: data ?? EMPTY, isLoading: !!subjectId && isPending };
}

/**
 * SSOT subscription for ALL knowledge-base articles (used by GlobalSearch).
 */
export function useAllKnowledgeBaseArticles(
  enabled: boolean = true,
): KnowledgeBaseArticle[] {
  const { data } = useQuery({
    queryKey: queryKeys.knowledgeBase.all(),
    queryFn: () => loadAllArticles(),
    enabled,
  });
  return data ?? EMPTY;
}

// B3 — `useKnowledgeBaseHeadersBySubject` removed: had zero call-sites and
// duplicated the `byCategory` invalidation cycle. If a header-only view
// returns, derive it via TanStack `select` over the existing byCategory
// query so headers share the same cache slot as the full article list.
