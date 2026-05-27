/**
 * PR-7f M3e — Zettelkasten (Knowledge Base) cut-over.
 *
 * Replaces direct `saveArticle` / `deleteArticle` / `bulkCreateArticlesIfMissing`
 * calls with `useMutation`:
 *   - optimistic update of `['knowledgeBase','byCategory', subjectId]` +
 *     `['knowledgeBase','byId', id]` + `['knowledgeBase','all']` when seeded,
 *   - rollback iz ctx.prev on error,
 *   - bridge (`onKnowledgeBaseChanged → invalidateQueries(['knowledgeBase'])`)
 *     pokupi notify iz repo-a u onSettled.
 *
 * Alias-mutate (article.aliases) je deo article payload-a i prolazi kroz `save`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  saveArticle,
  deleteArticle,
  bulkCreateArticlesIfMissing,
  type KnowledgeBaseArticle,
} from "@/lib/zettelkasten-storage";

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

export function useKnowledgeBaseMutations() {
  const qc = useQueryClient();

  const save = useMutation<void, Error, KnowledgeBaseArticle, SaveCtx>({
    mutationFn: (article) => saveArticle(article),
    onMutate: async (article) => {
      await qc.cancelQueries({ queryKey: queryKeys.knowledgeBase.root });
      const prevAll = qc.getQueryData<KnowledgeBaseArticle[]>(queryKeys.knowledgeBase.all());
      const prevByCat = qc.getQueryData<KnowledgeBaseArticle[]>(
        queryKeys.knowledgeBase.byCategory(article.subjectId),
      );
      const prevById = qc.getQueryData<KnowledgeBaseArticle | null>(
        queryKeys.knowledgeBase.byId(article.id),
      );

      const upsert = (list: KnowledgeBaseArticle[]): KnowledgeBaseArticle[] => {
        const idx = list.findIndex(a => a.id === article.id);
        return idx >= 0
          ? list.map((a, i) => (i === idx ? article : a))
          : [article, ...list];
      };

      if (prevAll) qc.setQueryData(queryKeys.knowledgeBase.all(), upsert(prevAll));
      if (prevByCat) {
        qc.setQueryData(queryKeys.knowledgeBase.byCategory(article.subjectId), upsert(prevByCat));
      }
      qc.setQueryData(queryKeys.knowledgeBase.byId(article.id), article);
      return { prevAll, prevByCat, prevById };
    },
    onError: (_e, article, ctx) => {
      if (ctx?.prevAll !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.all(), ctx.prevAll);
      }
      if (ctx?.prevByCat !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.byCategory(article.subjectId), ctx.prevByCat);
      }
      if (ctx?.prevById !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.byId(article.id), ctx.prevById);
      }
    },
  });

  /**
   * Delete by id. Caller passes subjectId so we can scope optimistic removal
   * from the per-subject cache; if omitted we still drop the `byId` entry and
   * rely on the bridge invalidation to refresh lists.
   */
  const remove = useMutation<void, Error, { id: string; subjectId?: string | null }, DeleteCtx>({
    mutationFn: ({ id }) => deleteArticle(id),
    onMutate: async ({ id, subjectId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.knowledgeBase.root });
      const prevAll = qc.getQueryData<KnowledgeBaseArticle[]>(queryKeys.knowledgeBase.all());
      const prevByCat = subjectId
        ? qc.getQueryData<KnowledgeBaseArticle[]>(queryKeys.knowledgeBase.byCategory(subjectId))
        : undefined;
      const prevById = qc.getQueryData<KnowledgeBaseArticle | null>(queryKeys.knowledgeBase.byId(id));

      if (prevAll) {
        qc.setQueryData(queryKeys.knowledgeBase.all(), prevAll.filter(a => a.id !== id));
      }
      if (subjectId && prevByCat) {
        qc.setQueryData(
          queryKeys.knowledgeBase.byCategory(subjectId),
          prevByCat.filter(a => a.id !== id),
        );
      }
      qc.setQueryData(queryKeys.knowledgeBase.byId(id), null);
      return { subjectId: subjectId ?? null, prevAll, prevByCat, prevById };
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prevAll !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.all(), ctx.prevAll);
      }
      if (ctx?.subjectId && ctx.prevByCat !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.byCategory(ctx.subjectId), ctx.prevByCat);
      }
      if (ctx?.prevById !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.byId(id), ctx.prevById);
      }
    },
  });

  /**
   * Atomic batch placeholder creation. We cannot pre-compute which titles will
   * actually be created (case-insensitive de-dup happens server-side inside
   * the rw tx), so onMutate is a no-op for optimistic state — we only snapshot
   * for symmetry. The bridge invalidates everything in onSettled.
   */
  const bulkCreate = useMutation<KnowledgeBaseArticle[], Error, BulkInput, BulkCtx>({
    mutationFn: ({ subjectId, titles, rootSubcategoryId }) =>
      bulkCreateArticlesIfMissing(subjectId, titles, rootSubcategoryId),
    onMutate: async ({ subjectId }) => {
      await qc.cancelQueries({ queryKey: queryKeys.knowledgeBase.byCategory(subjectId) });
      const prevByCat = qc.getQueryData<KnowledgeBaseArticle[]>(
        queryKeys.knowledgeBase.byCategory(subjectId),
      );
      return { prevByCat };
    },
    onError: (_e, { subjectId }, ctx) => {
      if (ctx?.prevByCat !== undefined) {
        qc.setQueryData(queryKeys.knowledgeBase.byCategory(subjectId), ctx.prevByCat);
      }
    },
  });

  return { save, remove, bulkCreate };
}
