/**
 * Source write-path mutations (PR-7f M3d).
 *
 * Wraps `saveSource` / `deleteSource` in TanStack `useMutation` with
 * optimistic `setQueryData` on both `['sources','all']` and the scoped
 * `['sources','cat', categoryId]` cache, plus `ctx.prev` rollback on error.
 *
 * `onSettled` is a no-op: `saveSource` / `deleteSource` fire
 * `onSourcesChanged`, which the `bridges.ts` listener turns into
 * `invalidateQueries(['sources'])`. So both optimistic and authoritative
 * reads converge automatically.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveSource, deleteSource, type Source } from "@/domains/sources/sources-storage";
import { queryKeys } from "@/lib/query/keys";

interface SaveCtx { prevAll?: Source[]; prevByCat?: Source[]; categoryId: string }
interface RemoveCtx { prevAll?: Source[]; prevByCat?: Source[]; categoryId: string }

function upsert(list: Source[] | undefined, next: Source): Source[] {
  if (!list) return [next];
  const idx = list.findIndex((s) => s.id === next.id);
  if (idx === -1) return [...list, next];
  const copy = list.slice();
  copy[idx] = next;
  return copy;
}

export function useSourceMutations() {
  const qc = useQueryClient();

  const save = useMutation<void, Error, Source, SaveCtx>({
    mutationFn: async (next) => {
      const res = await saveSource(next);
      if (res.ok === true) return;
      throw new Error(res.error.message);
    },
    onMutate: async (next) => {
      const allKey = queryKeys.sources.all();
      const catKey = queryKeys.sources.byCategory(next.categoryId);
      await Promise.all([
        qc.cancelQueries({ queryKey: allKey }),
        qc.cancelQueries({ queryKey: catKey }),
      ]);
      const prevAll = qc.getQueryData<Source[]>(allKey);
      const prevByCat = qc.getQueryData<Source[]>(catKey);
      qc.setQueryData<Source[]>(allKey, (prev) => upsert(prev, next));
      qc.setQueryData<Source[]>(catKey, (prev) => upsert(prev, next));
      return { prevAll, prevByCat, categoryId: next.categoryId };
    },
    onError: (_err, _next, ctx) => {
      if (!ctx) return;
      // Always restore — including `undefined`, which removes the optimistic
      // ghost entry from caches that didn't exist before this mutation.
      qc.setQueryData(queryKeys.sources.all(), ctx.prevAll);
      qc.setQueryData(queryKeys.sources.byCategory(ctx.categoryId), ctx.prevByCat);
    },
    // PR-H2 safety net: the bridge listener (`onSourcesChanged →
    // invalidate(['sources'])`) is the primary refetch trigger, but during
    // HMR or partial mount tears the listener can be transiently detached.
    // A single scoped invalidation here costs ~one redundant fetch in the
    // happy path and prevents stale optimistic state if the bridge missed
    // the event.
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sources.all() });
      if (vars?.categoryId) {
        void qc.invalidateQueries({ queryKey: queryKeys.sources.byCategory(vars.categoryId) });
      }
    },
  });

  const remove = useMutation<void, Error, { id: string; categoryId: string }, RemoveCtx>({
    mutationFn: ({ id }) => deleteSource(id),
    onMutate: async ({ id, categoryId }) => {
      const allKey = queryKeys.sources.all();
      const catKey = queryKeys.sources.byCategory(categoryId);
      await Promise.all([
        qc.cancelQueries({ queryKey: allKey }),
        qc.cancelQueries({ queryKey: catKey }),
      ]);
      const prevAll = qc.getQueryData<Source[]>(allKey);
      const prevByCat = qc.getQueryData<Source[]>(catKey);
      qc.setQueryData<Source[]>(allKey, (prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      qc.setQueryData<Source[]>(catKey, (prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
      return { prevAll, prevByCat, categoryId };
    },
    onError: (_err, vars, ctx) => {
      if (!ctx) return;
      qc.setQueryData(queryKeys.sources.all(), ctx.prevAll);
      qc.setQueryData(queryKeys.sources.byCategory(vars.categoryId), ctx.prevByCat);
    },
    // PR-H2 safety net — see `save.onSettled` rationale above.
    onSettled: (_data, _err, vars) => {
      void qc.invalidateQueries({ queryKey: queryKeys.sources.all() });
      if (vars?.categoryId) {
        void qc.invalidateQueries({ queryKey: queryKeys.sources.byCategory(vars.categoryId) });
      }
    },
  });

  return { save, remove };
}
