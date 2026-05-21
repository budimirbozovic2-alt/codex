/**
 * Orchestration hook for AutoSplitDialog.
 *
 * Owns: dialog phase + selection reducer + merge dialog state. Delegates
 * domain to `import-planner` and I/O to `autoSplitImportService`. UI stays dumb.
 */
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import { useCardData, useCardOnlyActions } from "@/contexts/AppContext";
import { detectArticles } from "@/lib/auto-split-engine";
import type { Source } from "@/lib/sources-storage";
import {
  buildArticleRows, mergeRows, ungroupRow, buildImportPlan,
  type ArticleRow,
} from "@/lib/auto-split/import-planner";
import { executeImportPlan } from "@/lib/services/autoSplitImportService";

import { logger } from "@/lib/logger";
export type AutoSplitPhase = "preview" | "importing" | "done";

interface RowsState { rows: ArticleRow[] }
type RowsAction =
  | { type: "set"; rows: ArticleRow[] }
  | { type: "toggle"; idx: number }
  | { type: "toggleAll" }
  | { type: "merge"; indices: number[]; name: string }
  | { type: "ungroup"; idx: number };

function rowsReducer(state: RowsState, action: RowsAction): RowsState {
  switch (action.type) {
    case "set":
      return { rows: action.rows };
    case "toggle":
      return {
        rows: state.rows.map((r, i) => (i === action.idx ? { ...r, selected: !r.selected } : r)),
      };
    case "toggleAll": {
      const allSelected = state.rows.every((r) => r.selected);
      return { rows: state.rows.map((r) => ({ ...r, selected: !allSelected })) };
    }
    case "merge":
      return { rows: mergeRows(state.rows, action.indices, action.name) };
    case "ungroup":
      return { rows: ungroupRow(state.rows, action.idx) };
  }
}

export function useAutoSplitImport(open: boolean, source: Source) {
  const { cards } = useCardData();
  const { bulkAddCards, updateCard } = useCardOnlyActions();

  const [phase, setPhase] = useState<AutoSplitPhase>("preview");
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [mergeNameDialog, setMergeNameDialog] = useState(false);
  const [mergeName, setMergeName] = useState("");

  const detected = useMemo(
    () => (open ? detectArticles(source.htmlContent) : []),
    [open, source.htmlContent],
  );
  const linkedCards = useMemo(
    () => cards.filter((c) => c.sourceId === source.id),
    [cards, source.id],
  );

  const [state, dispatch] = useReducer(rowsReducer, { rows: [] });

  // Full reset only when the dialog opens or the source changes — NOT on
  // every cards mutation (otherwise a successful import would flip the UI
  // from "done" back to "preview" the moment bulkAddCards updates context).
  useEffect(() => {
    if (!open) return;
    dispatch({ type: "set", rows: buildArticleRows(detected, linkedCards) });
    setPhase("preview");
    setProgress(0);
    setImportedCount(0);
    setMergeNameDialog(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source.id]);

  // Refresh row "exists" status when linked cards change, but only while
  // the user is still in the preview phase (don't disturb importing/done).
  useEffect(() => {
    setPhase((p) => {
      if (p === "preview") {
        dispatch({ type: "set", rows: buildArticleRows(detected, linkedCards) });
      }
      return p;
    });
  }, [detected, linkedCards]);

  const rows = state.rows;
  const selectedIndices = useMemo(
    () => rows.map((r, i) => (r.selected ? i : -1)).filter((i) => i >= 0),
    [rows],
  );
  const selectedCount = selectedIndices.length;
  const canMerge = selectedCount >= 2;

  const counts = useMemo(() => ({
    newCount: rows.filter((r) => r.status === "new").length,
    existsCount: rows.filter((r) => r.status === "exists").length,
    groupCount: rows.filter((r) => r.isGroup).length,
  }), [rows]);

  const toggleRow = useCallback((idx: number) => dispatch({ type: "toggle", idx }), []);
  const toggleAll = useCallback(() => dispatch({ type: "toggleAll" }), []);
  const ungroup = useCallback((idx: number) => dispatch({ type: "ungroup", idx }), []);

  const openMergeDialog = useCallback(() => {
    if (!canMerge) return;
    const first = rows[selectedIndices[0]];
    const nums = selectedIndices
      .map((i) => rows[i].articles.map((a) => a.articleNum).join(","))
      .join(", ");
    setMergeName(first.groupName || `Čl. ${nums}`);
    setMergeNameDialog(true);
  }, [canMerge, rows, selectedIndices]);

  const closeMergeDialog = useCallback(() => setMergeNameDialog(false), []);

  const confirmMerge = useCallback(() => {
    const name = mergeName.trim();
    if (!name) return;
    dispatch({ type: "merge", indices: selectedIndices, name });
    setMergeNameDialog(false);
  }, [mergeName, selectedIndices]);

  const startImport = useCallback(async () => {
    const plan = buildImportPlan(rows, source);
    if (plan.toCreate.length === 0 && plan.toUpdate.length === 0) return;
    setPhase("importing");
    setProgress(0);
    const result = await executeImportPlan(plan, {
      bulkAddCards,
      updateCard,
      onProgress: setProgress,
    });
    if (import.meta.env.DEV) {
      logger.log(
        `[AutoSplit] created=${result.created} updated=${result.updated} idbTotal=${result.idbCount}`,
      );
    }
    setImportedCount(result.total);
    setPhase("done");
    toast.success(`Generisano ${result.total} eseja`, { description: `Iz izvora "${source.title}"` });
  }, [rows, source, bulkAddCards, updateCard]);

  return {
    phase, progress, importedCount,
    detected, rows, selectedCount, canMerge, counts, selectedIndices,
    toggleRow, toggleAll, ungroup,
    mergeNameDialog, mergeName, setMergeName,
    openMergeDialog, closeMergeDialog, confirmMerge,
    startImport,
  };
}
