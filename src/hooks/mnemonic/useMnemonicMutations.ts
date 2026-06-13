/**
 * PR-7f M3c — Mnemonics write-path useMutation cut-over.
 *
 * Replaces direct `saveMnemonicCards` / `saveMajorSystem` / `addMnemonicTestEntry`
 * calls. Each mutation snapshots affected query caches in `onMutate`,
 * rolls back in `onError`, and fires `notifyMnemonics()` in `onSettled` so
 * the bridge invalidates `['mnemonics']` (covers cards, major-system, testLog).
 *
 * mutationFn goes directly to the SQLite-primary queries (which throw on
 * failure) — wrappers in `mnemonic-storage` swallow errors and would defeat
 * rollback semantics.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import {
  bulkPutMnemonics,
  deleteMnemonic as repoDeleteMnemonic,
  bulkPutMajorSystemPegs as bulkPutPegs,
  addTestLogEntry,
} from "@/lib/db/queries";
import { notifyMnemonics } from "@/domains/mnemonic";
import type {
  MnemonicCard,
  MnemonicTestLogEntry,
} from "@/domains/mnemonic";

interface SaveCardsCtx {
  prevAll: MnemonicCard[] | undefined;
  prevByCat: Record<string, MnemonicCard[] | undefined>;
}

interface DeleteCardCtx {
  prevAll: MnemonicCard[] | undefined;
  prevByCat: MnemonicCard[] | undefined;
  cat: string | undefined;
}

interface SaveMajorCtx {
  prev: Record<number, string> | undefined;
}

export function useMnemonicMutations() {
  const qc = useQueryClient();

  const saveCards = useMutation<void, Error, MnemonicCard[], SaveCardsCtx>({
    mutationFn: async (next) => {
      await bulkPutMnemonics(next);
    },
    onMutate: async (next) => {
      // PR-G1 / C-1 fix:
      // `bulkPutMnemonics` is a per-id UPSERT, and callers (MnemonicModule
      // with categoryFilter, SourceReader, CardSelectionEditor) pass only
      // the cards they care about (typically a single category's subset).
      // Earlier `setQueryData(all(), next)` therefore SILENTLY DROPPED every
      // other category from the in-memory cache until bridge invalidation
      // refetched it — a window in which any consumer of `mnemonics.all()`
      // would see a truncated list. Fix: upsert-merge `next` into `prevAll`
      // by id, and only touch byCategory caches for categories actually
      // present in `next`.
      await qc.cancelQueries({ queryKey: queryKeys.mnemonics.root });
      const prevAll = qc.getQueryData<MnemonicCard[]>(queryKeys.mnemonics.all());

      const nextIds = new Set(next.map((c) => c.id));
      const mergedAll: MnemonicCard[] = [
        ...(prevAll ?? []).filter((c) => !nextIds.has(c.id)),
        ...next,
      ];
      qc.setQueryData<MnemonicCard[]>(queryKeys.mnemonics.all(), mergedAll);

      // Group `next` by the (new) categoryId so we can re-seed only the
      // affected byCategory caches.
      const byNextCat = new Map<string, MnemonicCard[]>();
      for (const c of next) {
        const arr = byNextCat.get(c.categoryId) ?? [];
        arr.push(c);
        byNextCat.set(c.categoryId, arr);
      }
      // Also: if any card moved BETWEEN categories, the old category's
      // cache needs the stale row removed. Detect by comparing prevAll's
      // categoryId for each id in `next` against the new one.
      const prevById = new Map<string, MnemonicCard>(
        (prevAll ?? []).map((c) => [c.id, c]),
      );
      const touchedCats = new Set<string>(byNextCat.keys());
      for (const c of next) {
        const prevCat = prevById.get(c.id)?.categoryId;
        if (prevCat && prevCat !== c.categoryId) touchedCats.add(prevCat);
      }

      const prevByCat: Record<string, MnemonicCard[] | undefined> = {};
      for (const cat of touchedCats) {
        prevByCat[cat] = qc.getQueryData<MnemonicCard[]>(
          queryKeys.mnemonics.byCategory(cat),
        );
        const base = (prevByCat[cat] ?? []).filter((c) => !nextIds.has(c.id));
        const additions = byNextCat.get(cat) ?? [];
        qc.setQueryData<MnemonicCard[]>(
          queryKeys.mnemonics.byCategory(cat),
          [...base, ...additions],
        );
      }
      return { prevAll, prevByCat };
    },
    onError: (_e, _vars, ctx) => {
      if (!ctx) return;
      qc.setQueryData(queryKeys.mnemonics.all(), ctx.prevAll);
      for (const [cat, prev] of Object.entries(ctx.prevByCat)) {
        qc.setQueryData(queryKeys.mnemonics.byCategory(cat), prev);
      }
    },
    onSettled: () => {
      notifyMnemonics();
    },
  });

  const deleteCard = useMutation<void, Error, string, DeleteCardCtx>({
    mutationFn: async (id) => {
      await repoDeleteMnemonic(id);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.mnemonics.root });
      const prevAll = qc.getQueryData<MnemonicCard[]>(queryKeys.mnemonics.all());
      const target = prevAll?.find((c) => c.id === id);
      if (prevAll) {
        qc.setQueryData<MnemonicCard[]>(
          queryKeys.mnemonics.all(),
          prevAll.filter((c) => c.id !== id),
        );
      }
      let prevByCat: MnemonicCard[] | undefined;
      const cat = target?.categoryId;
      if (cat) {
        prevByCat = qc.getQueryData<MnemonicCard[]>(queryKeys.mnemonics.byCategory(cat));
        if (prevByCat) {
          qc.setQueryData<MnemonicCard[]>(
            queryKeys.mnemonics.byCategory(cat),
            prevByCat.filter((c) => c.id !== id),
          );
        }
      }
      return { prevAll, prevByCat, cat };
    },
    onError: (_e, _vars, ctx) => {
      if (!ctx) return;
      qc.setQueryData(queryKeys.mnemonics.all(), ctx.prevAll);
      if (ctx.cat) qc.setQueryData(queryKeys.mnemonics.byCategory(ctx.cat), ctx.prevByCat);
    },
    onSettled: () => {
      notifyMnemonics();
    },
  });

  const saveMajor = useMutation<void, Error, Record<number, string>, SaveMajorCtx>({
    mutationFn: async (system) => {
      const records = Object.entries(system).map(([id, peg]) => ({
        id: parseInt(id, 10),
        peg,
      }));
      await bulkPutPegs(records);
    },
    onMutate: async (system) => {
      await qc.cancelQueries({ queryKey: queryKeys.mnemonics.majorSystem() });
      const prev = qc.getQueryData<Record<number, string>>(
        queryKeys.mnemonics.majorSystem(),
      );
      qc.setQueryData(queryKeys.mnemonics.majorSystem(), system);
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(queryKeys.mnemonics.majorSystem(), ctx.prev);
      }
    },
    onSettled: () => {
      notifyMnemonics();
    },
  });

  const logTestResult = useMutation<void, Error, MnemonicTestLogEntry>({
    mutationFn: async (entry) => {
      await addTestLogEntry(entry);
    },
    // Append-only log; no UI consumer of `mnemonics.testLog` keeps a
    // local snapshot worth rolling back. Bridge invalidation is enough.
    onSettled: () => {
      notifyMnemonics();
    },
  });

  return { saveCards, deleteCard, saveMajor, logTestResult };
}
