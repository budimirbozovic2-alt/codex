/**
 * PR-7f M3e — Zettelkasten (Knowledge Base) cut-over.
 *
 * Replaces direct saveArticle/deleteArticle calls with useMutation.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  saveArticle,
  deleteArticle,
  bulkCreateArticlesIfMissing,
  type KnowledgeBaseArticle,
} from "@/domains/zettelkasten/zettelkasten-storage";

interface SaveCtx {
  prevAll: KnowledgeBaseArticle[] | undefined;
  prevByCat: KnowledgeBaseArticle[] | undefined;
  prevById: KnowledgeBaseArticle | null | undefined;
}

interface DeleteCtx {
  subjectId: string | null;
  prevAll: KnowledgeBaseArticle[] | undefined;
  prevByCat: KnowledgeBaseArticle[] | undefined;
  prevById: KnowledgeBaseArticle | null | undefined;
}

interface BulkInput {
  subjectId: string;
  titles: string[];
  rootSubcategoryId?: string;
}
interface BulkCtx {
  prevByCat: KnowledgeBaseArticle[] | undefined;
}

// BUG 5 FIX: Pomocna funkcija za bezbjednu ekstrakciju kljuca
function getKbCategoryKey(subjectId: string): readonly unknown[] {
  const kb = queryKeys.knowledgeBase as any;
  if (typeof kb.byCategory === "function") {
    return kb.byCategory(subjectId);
  }
  if (typeof kb.bySubject === "function") {
    return kb.bySubject(subjectId);
  }
  return ["knowledgeBase", "cat", subjectId];
}

export function useKnowledgeBaseMutations() {
  const qc = useQueryClient();

  const save = useMutation<
    void, Error, KnowledgeBaseArticle, SaveCtx
  >({
    mutationFn: (article) => saveArticle(article),
    onMutate: async (article) => {
      await qc.cancelQueries({ 
        queryKey: queryKeys.knowledgeBase.root 
      });
      const prevAll = qc.getQueryData<KnowledgeBaseArticle[]>(
        queryKeys.knowledgeBase.all()
      );
      const prevByCat = qc.getQueryData<KnowledgeBaseArticle[]>(
        getKbCategoryKey(article.subjectId)
      );
      const prevById = qc.getQueryData<KnowledgeBaseArticle | null>(
        queryKeys.knowledgeBase.byId(article.id)
      );

      const upsert = (
        list: KnowledgeBaseArticle[]
      ): KnowledgeBaseArticle[] => {
        const idx = list.findIndex(a => a.id === article.id);
        return idx >= 0
          ? list.map((a, i) => (i === idx ? article : a))
          : [article, ...list];
      };

      if (prevAll) {
        qc.setQueryData(queryKeys.knowledgeBase.all(), upsert(prevAll));
      }
      if (prevByCat) {
        qc.setQueryData(
          getKbCategoryKey(article.subjectId), 
          upsert(prevByCat)
        );
      }
      qc.setQueryData(
        queryKeys.knowledgeBase.byId(article.id), 
        article
      );
      return { prevAll, prevByCat, prevById };
    },
    onError: (_e, article, ctx) => {
      if (ctx?.prevAll !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.all(), ctx.prevAll);
      }
      if (ctx?.prevByCat !== undefined) {
        qc.setQueryData(
          getKbCategoryKey(article.subjectId), 
          ctx.prevByCat
        );
      }
      if (ctx?.prevById !== undefined) {
        qc.setQueryData(
          queryKeys.knowledgeBase.byId(article.id), 
          ctx.prevById
        );
      }
    },
  });

  const remove = useMutation<
    void, Error, { id: string; subjectId?: string | null }, DeleteCtx
  >({
    mutationFn: ({ id }) => deleteArticle(id),
    onMutate: async ({ id, subjectId }) => {
      await qc.cancelQueries({ 
        queryKey: queryKeys.knowledgeBase.root 
      });
      const prevAll = qc.getQueryData<KnowledgeBaseArticle[]>(
        queryKeys.knowledgeBase.all()
      );
      const prevByCat = subjectId
        ? qc.getQueryData<KnowledgeBaseArticle[]>(
            getKbCategoryKey(subjectId)
          )
        : undefined;
      const prevById = qc.getQueryData<KnowledgeBaseArticle | null>(
        queryKeys.knowledgeBase.byId(id)
      );

      if (prevAll) {
        qc.setQueryData(
          queryKeys.knowledgeBase.all(), 
          prevAll.filter(a => a.id !== id)
        );
      }
      if (subjectId && prevByCat) {
        qc.setQueryData(
          getKbCategoryKey(subjectId),
          prevByCat.filter(a => a.id !== id),
        );
      }
      qc.setQueryData(queryKeys.knowledgeBase.byId(id), null);
      return { 
        subjectId: subjectId ?? null, 
        prevAll, 
        prevByCat, 
        prevById 
      };
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prevAll !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.all(), ctx.prevAll);
      }
      if (ctx?.subjectId && ctx.prevByCat !== undefined) {
        qc.setQueryData(
          getKbCategoryKey(ctx.subjectId), 
          ctx.prevByCat
        );
      }
      if (ctx?.prevById !== undefined) {
        qc.setQueryData(
          queryKeys.knowledgeBase.byId(id), 
          ctx.prevById
        );
      }
    },
  });

  const bulkCreate = useMutation<
    KnowledgeBaseArticle[], Error, BulkInput, BulkCtx
  >({
    mutationFn: ({ subjectId, titles, rootSubcategoryId }) =>
      bulkCreateArticlesIfMissing(
        subjectId, titles, rootSubcategoryId
      ),
    onMutate: async ({ subjectId }) => {
      await qc.cancelQueries({ 
        queryKey: getKbCategoryKey(subjectId) 
      });
      const prevByCat = qc.getQueryData<KnowledgeBaseArticle[]>(
        getKbCategoryKey(subjectId)
      );
      return { prevByCat };
    },
    onError: (_e, { subjectId }, ctx) => {
      if (ctx?.prevByCat !== undefined) {
        qc.setQueryData(
          getKbCategoryKey(subjectId), 
          ctx.prevByCat
        );
      }
    },
  });

  return { save, remove, bulkCreate };
}