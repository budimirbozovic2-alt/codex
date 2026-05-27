/**
 * Article-level mutations: create, open, back-to-index, delete, wiki-link.
 *
 * All mutations:
 *  - Always `await draftApi.flush()` before navigation/state change so pending
 *    edits never get lost.
 *  - Emit the matching event-bus event after the IDB write succeeds.
 *  - Own toast user-feedback (single source).
 *
 * The wiki-link in-flight dedupe guards against parallel clicks on the same
 * placeholder title (one IDB transaction, one toast).
 */
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  newArticle,
  findArticleByTitle,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";
import { backlinkIndex } from "@/lib/backlink-index";
import { useKnowledgeBaseMutations } from "@/hooks/zettelkasten/useKnowledgeBaseMutations";
import type { ArticleDraftApi } from "./useArticleDraft";

interface Input {
  categoryId: string | undefined;
  articles: KnowledgeBaseArticle[];
  setArticles: React.Dispatch<React.SetStateAction<KnowledgeBaseArticle[]>>;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  setReadingSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  indexArticleId: string | null;
  activeArticle: KnowledgeBaseArticle | null;
  draftApi: ArticleDraftApi;
}

export interface ArticleMutationsApi {
  create: (title?: string) => Promise<void>;
  open: (id: string) => void;
  backToIndex: () => Promise<void>;
  remove: () => Promise<void>;
  wikiLink: (title: string) => Promise<void>;
}

export function useArticleMutations(input: Input): ArticleMutationsApi {
  const {
    categoryId, articles, setArticles, setActiveId, setReadingSourceId,
    indexArticleId, activeArticle, draftApi,
  } = input;

  const wikiLinkInFlightRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const { save: saveMutation, remove: removeMutation, bulkCreate: bulkCreateMutation } = useKnowledgeBaseMutations();

  // Mirror articles into a ref so `open` doesn't churn its identity on every
  // upsert/delete (would cascade re-renders into ZettelExplorerPanel).
  const articlesRef = useRef(articles);
  useEffect(() => { articlesRef.current = articles; }, [articles]);

  const create = useCallback(async (title?: string) => {
    if (!categoryId) return;
    const t = (title ?? prompt("Naslov novog članka:") ?? "").trim();
    if (!t) return;
    const article = newArticle(categoryId, t);
    await saveMutation.mutateAsync(article);
    setArticles(prev => [article, ...prev]);
    backlinkIndex.upsertArticle(categoryId, article);
    setActiveId(article.id);
    draftApi.enterEdit(article);
  }, [categoryId, setArticles, setActiveId, draftApi, saveMutation]);

  const open = useCallback((id: string) => {
    setReadingSourceId(null);
    setActiveId(id);
    const target = articlesRef.current.find(a => a.id === id) ?? null;
    draftApi.resetForArticle(target, { autoEditEmpty: true });
  }, [setActiveId, setReadingSourceId, draftApi]);

  const backToIndex = useCallback(async () => {
    await draftApi.flush();
    setReadingSourceId(null);
    draftApi.exitEdit();
    setActiveId(indexArticleId ?? null);
  }, [draftApi, setActiveId, setReadingSourceId, indexArticleId]);

  const remove = useCallback(async () => {
    if (!activeArticle) return;
    if (activeArticle.isIndex) {
      toast.error("Index članak (polazna tačka predmeta) se ne može obrisati.");
      return;
    }
    if (!confirm(`Obrisati članak "${activeArticle.title}"?`)) return;
    await removeMutation.mutateAsync({ id: activeArticle.id, subjectId: activeArticle.subjectId });
    backlinkIndex.removeArticle(activeArticle.subjectId, activeArticle.id);
    setArticles(prev => prev.filter(a => a.id !== activeArticle.id));
    setActiveId(indexArticleId && indexArticleId !== activeArticle.id ? indexArticleId : null);
    draftApi.exitEdit();
    toast.success("Članak obrisan");
  }, [activeArticle, indexArticleId, setArticles, setActiveId, draftApi, removeMutation]);

  const wikiLink = useCallback(async (title: string) => {
    if (!categoryId) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();

    await draftApi.flush();

    // Resolve aliases / canonical first — no placeholder spawn.
    const resolvedId = backlinkIndex.resolveTargetToArticleId(categoryId, trimmed);
    if (resolvedId) {
      open(resolvedId);
      return;
    }

    let pending = wikiLinkInFlightRef.current.get(key);
    if (!pending) {
      pending = (async (): Promise<string | null> => {
        try {
          const created = await bulkCreateMutation.mutateAsync({
            subjectId: categoryId,
            titles: [trimmed],
            rootSubcategoryId: activeArticle?.rootSubcategoryId,
          });
          if (created.length > 0) {
            const article = created[0];
            setArticles(prev => [article, ...prev]);
            backlinkIndex.upsertArticle(categoryId, article);
            toast.success(`Kreiran novi članak "${article.title}"`);
            return article.id;
          }
          const existing = await findArticleByTitle(categoryId, trimmed);
          return existing?.id ?? null;
        } finally {
          wikiLinkInFlightRef.current.delete(key);
        }
      })();
      wikiLinkInFlightRef.current.set(key, pending);
    }

    const id = await pending;
    if (id) open(id);
  }, [categoryId, activeArticle, setArticles, draftApi, open, bulkCreateMutation]);

  return { create, open, backToIndex, remove, wikiLink };
}
