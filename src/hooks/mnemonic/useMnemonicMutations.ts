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
import { notifyMnemonics } from "@/features/mnemonic/mnemonic-storage/cards-repo";
import type {
  MnemonicCard,
  MnemonicTestLogEntry,
} from "@/features/mnemonic/mnemonic-storage";

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
      await qc.cancelQueries({ queryKey: queryKeys.mnemonics.root });
      const prevAll = qc.getQueryData<MnemonicCard[]>(queryKeys.mnemonics.all());
      qc.setQueryData<MnemonicCard[]>(queryKeys.mnemonics.all(), next);

      // Re-seed every scoped category cache that this write touches.
      const byCat = new Map<string, MnemonicCard[]>();
      for (const c of next) {
        const arr = byCat.get(c.categoryId) ?? [];
        arr.push(c);
        byCat.set(c.categoryId, arr);
      }
      // Also reset categories that previously held cards but are now empty.
      for (const prev of prevAll ?? []) {
        if (!byCat.has(prev.categoryId)) byCat.set(prev.categoryId, []);
      }

      const prevByCat: Record<string, MnemonicCard[] | undefined> = {};
      byCat.forEach((arr, cat) => {
        prevByCat[cat] = qc.getQueryData<MnemonicCard[]>(
          queryKeys.mnemonics.byCategory(cat),
        );
        qc.setQueryData<MnemonicCard[]>(queryKeys.mnemonics.byCategory(cat), arr);
      });
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
