/**
 * Bootstrap loader for the Zettelkasten subject view.
 *
 * PR-7f M3g — articles flow through TanStack Query
 * (`useKnowledgeBaseArticlesBySubject`). Bridge invalidation
 * (`domain:changed{zettelkasten} → invalidateQueries(['knowledgeBase'])`) keeps
 * the cache hot after every write; mutation hooks own optimistic cache updates.
 *
 * Responsibilities:
 *  - Ensure an Index article exists once per subject (auto-create / promote).
 *  - Warm the per-subject `backlinkIndex` ONCE — incremental upserts via
 *    mutation hooks keep the index hot on subsequent edits.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ensureIndexArticle,
  type KnowledgeBaseArticle,
} from "@/domains/zettelkasten/zettelkasten-storage";
import { backlinkIndex } from "@/lib/backlink-index";
import { logger } from "@/lib/logger";
import { useKnowledgeBaseArticlesBySubject } from "./useKnowledgeBaseArticles";

interface BootstrapInput {
  categoryId: string | undefined;
  subjectName: string | null;
  subcategoryNames: string[];
}

interface BootstrapResult {
  articles: KnowledgeBaseArticle[];
  loading: boolean;
  indexArticleId: string | null;
}

export function useZettelkastenBootstrap(
  { categoryId, subjectName, subcategoryNames }: BootstrapInput,
): BootstrapResult & { initialActiveId: string | null } {
  const { data: articles, isLoading } = useKnowledgeBaseArticlesBySubject(categoryId);
  const [initialActiveId, setInitialActiveId] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState<boolean>(true);

  const seedNamesKey = useMemo(() => subcategoryNames.join("\u0001"), [subcategoryNames]);

  useEffect(() => {
    if (!categoryId || !subjectName) {
      setEnsuring(false);
      return;
    }
    let cancelled = false;
    setEnsuring(true);
    ensureIndexArticle(categoryId, subjectName, subcategoryNames)
      .then((idx) => {
        if (cancelled) return;
        setInitialActiveId(prev => prev ?? idx.id);
        setEnsuring(false);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn("[zettelkasten] ensureIndexArticle failed", err);
        setEnsuring(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, subjectName, seedNamesKey]);

  const warmedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!categoryId || articles.length === 0) return;
    if (warmedFor.current === categoryId) return;
    if (!backlinkIndex.hasSubject(categoryId)) {
      backlinkIndex.rebuildFromAll(categoryId, articles);
    }
    warmedFor.current = categoryId;
  }, [categoryId, articles]);

  const indexArticleId = useMemo(
    () => articles.find(a => a.isIndex)?.id ?? null,
    [articles],
  );

  return {
    articles,
    loading: isLoading || ensuring,
    indexArticleId,
    initialActiveId,
  };
}
