/**
 * Bootstrap loader for the Zettelkasten subject view.
 *
 * PR-7f M3g — articles now flow through TanStack Query
 * (`useKnowledgeBaseArticlesBySubject`). The old `useState +
 * loadArticlesBySubject` reader is gone; bridge invalidation
 * (`onKnowledgeBaseChanged → invalidateQueries(['knowledgeBase'])`) keeps
 * the cache hot after every write.
 *
 * Responsibilities retained:
 *  - Ensure an Index article exists once per subject (auto-create / promote).
 *  - Warm the per-subject `backlinkIndex` ONCE — subsequent re-mounts skip
 *    the full O(N × avgLinks) rebuild because incremental upserts via the
 *    eventBus subscription keep the index hot.
 *  - Expose a `setArticles` writer that funnels into the query cache so the
 *    existing optimistic call-sites (mutations, draft flush, wiki auto-
 *    create) keep working without each one talking to TanStack directly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ensureIndexArticle,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { backlinkIndex } from "@/lib/backlink-index";
import { queryKeys } from "@/lib/query/keys";
import { useKnowledgeBaseArticlesBySubject } from "./useKnowledgeBaseArticles";

interface BootstrapInput {
  categoryId: string | undefined;
  subjectName: string | null;
  subcategoryNames: string[];
}

interface BootstrapResult {
  articles: KnowledgeBaseArticle[];
  /**
   * @deprecated A1 — Ad-hoc cache writer kept for the brief refetch gap
   * after `useKnowledgeBaseMutations.bulkCreate` (which has no optimistic
   * `onMutate`). All DB writes MUST go through `useKnowledgeBaseMutations`
   * (`save` / `remove` / `bulkCreate`) — those have proper snapshot /
   * rollback / bridge invalidation. Do NOT introduce new `setArticles`
   * call-sites; route through the mutation hooks instead. This funnel
   * exists only for backwards compatibility with the existing draft +
   * wiki-link flows and will be removed once `bulkCreate` grows an
   * `onSuccess` cache-prepend.
   */
  setArticles: React.Dispatch<React.SetStateAction<KnowledgeBaseArticle[]>>;
  loading: boolean;
  indexArticleId: string | null;
}

export function useZettelkastenBootstrap(
  { categoryId, subjectName, subcategoryNames }: BootstrapInput,
): BootstrapResult & { initialActiveId: string | null } {
  const qc = useQueryClient();
  const { data: articles, isLoading } = useKnowledgeBaseArticlesBySubject(categoryId);
  const [initialActiveId, setInitialActiveId] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState<boolean>(true);

  // Stable seed key so subcategory list identity changes don't reboot the view
  // unless their *content* differs.
  const seedNamesKey = useMemo(() => subcategoryNames.join("\u0001"), [subcategoryNames]);

  // Run ensureIndexArticle once per (subjectId, seedNamesKey). Its internal
  // putArticle fires `notifyKnowledgeBaseChanged`, which the bridge picks up
  // and refetches the byCategory query — no manual list merging required.
  useEffect(() => {
    if (!categoryId || !subjectName) {
      setEnsuring(false);
      return;
    }
    let cancelled = false;
    setEnsuring(true);
    ensureIndexArticle(categoryId, subjectName, subcategoryNames).then((idx) => {
      if (cancelled) return;
      setInitialActiveId(prev => prev ?? idx.id);
      setEnsuring(false);
    });
    return () => { cancelled = true; };
    // Reason: `seedNamesKey` is a stable join of subcategoryNames; the array itself
    // recreates on every render but the joined key is the real identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subjectName, seedNamesKey]);

  // Idempotent backlink warm-up — only the FIRST settled load per subject
  // pays the rebuild cost. `backlinkIndex.hasSubject` guards re-renders.
  const warmedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!categoryId || articles.length === 0) return;
    if (warmedFor.current === categoryId) return;
    if (!backlinkIndex.hasSubject(categoryId)) {
      backlinkIndex.rebuildFromAll(categoryId, articles);
    }
    warmedFor.current = categoryId;
  }, [categoryId, articles]);

  // Funnel for the legacy `setArticles` writer (see @deprecated note on
  // BootstrapResult). Wrapped in `cancelQueries` so a parallel refetch
  // can't immediately overwrite the optimistic update before React
  // commits — matches the snapshot/rollback contract used by mutations.
  const setArticles = useCallback<React.Dispatch<React.SetStateAction<KnowledgeBaseArticle[]>>>(
    (updater) => {
      if (!categoryId) return;
      const key = queryKeys.knowledgeBase.byCategory(categoryId);
      void qc.cancelQueries({ queryKey: key });
      qc.setQueryData<KnowledgeBaseArticle[]>(key, (prev) => {
        const base = prev ?? [];
        return typeof updater === "function"
          ? (updater as (p: KnowledgeBaseArticle[]) => KnowledgeBaseArticle[])(base)
          : updater;
      });
    },
    [qc, categoryId],
  );

  const indexArticleId = useMemo(
    () => articles.find(a => a.isIndex)?.id ?? null,
    [articles],
  );

  return {
    articles,
    setArticles,
    loading: isLoading || ensuring,
    indexArticleId,
    initialActiveId,
  };
}
