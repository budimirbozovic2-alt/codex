/**
 * PR-7f M3b — MindMaps cut-over.
 *
 * Replaces direct `saveMindMap` / `deleteMindMap` calls with `useMutation`:
 *   - optimistic update of `['mindMaps','all']` + `['mindMaps','id', id]`,
 *   - rollback iz ctx.prev on error,
 *   - bridge (`onMindMapsChanged → invalidateQueries(['mindMaps'])`)
 *     pokupi notify iz `mindmap-storage` u onSettled.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { saveMindMap, deleteMindMap } from "@/lib/mindmap-storage";
import type { MindMapDoc } from "@/lib/db-types";

interface SaveCtx {
  prevAll: MindMapDoc[] | undefined;
  prevById: MindMapDoc | null | undefined;
}
interface DeleteCtx {
  prevAll: MindMapDoc[] | undefined;
  prevById: MindMapDoc | null | undefined;
}

export function useMindMapMutations() {
  const qc = useQueryClient();

  const save = useMutation<void, Error, MindMapDoc, SaveCtx>({
    mutationFn: (doc) => saveMindMap(doc),
    onMutate: async (doc) => {
      await qc.cancelQueries({ queryKey: queryKeys.mindMaps.root });
      const prevAll = qc.getQueryData<MindMapDoc[]>(queryKeys.mindMaps.all());
      const prevById = qc.getQueryData<MindMapDoc | null>(queryKeys.mindMaps.byId(doc.id));

      if (prevAll) {
        const idx = prevAll.findIndex(d => d.id === doc.id);
        const next = idx >= 0
          ? prevAll.map((d, i) => (i === idx ? doc : d))
          : [...prevAll, doc];
        qc.setQueryData(queryKeys.mindMaps.all(), next);
      }
      qc.setQueryData(queryKeys.mindMaps.byId(doc.id), doc);
      return { prevAll, prevById };
    },
    onError: (_e, doc, ctx) => {
      if (ctx?.prevAll !== undefined) {
        qc.setQueryData(queryKeys.mindMaps.all(), ctx.prevAll);
      }
      if (ctx?.prevById !== undefined) {
        qc.setQueryData(queryKeys.mindMaps.byId(doc.id), ctx.prevById);
      }
    },
  });

  const remove = useMutation<void, Error, string, DeleteCtx>({
    mutationFn: (id) => deleteMindMap(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.mindMaps.root });
      const prevAll = qc.getQueryData<MindMapDoc[]>(queryKeys.mindMaps.all());
      const prevById = qc.getQueryData<MindMapDoc | null>(queryKeys.mindMaps.byId(id));

      if (prevAll) {
        qc.setQueryData(queryKeys.mindMaps.all(), prevAll.filter(d => d.id !== id));
      }
      qc.setQueryData(queryKeys.mindMaps.byId(id), null);
      return { prevAll, prevById };
    },
    onError: (_e, id, ctx) => {
      if (ctx?.prevAll !== undefined) {
        qc.setQueryData(queryKeys.mindMaps.all(), ctx.prevAll);
      }
      if (ctx?.prevById !== undefined) {
        qc.setQueryData(queryKeys.mindMaps.byId(id), ctx.prevById);
      }
    },
  });

  return { save, remove };
}
