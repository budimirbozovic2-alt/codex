import { useCallback } from "react";
import { toast } from "sonner";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import { type Source } from "@/domains/sources/sources-storage";
import { useSourceReaderStore } from "@/store";
import { firstWords, type SelectionModule } from "@/lib/selection-split-engine";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  buildSeparateEssaysFromModules,
  buildCombinedEssayFromModules,
  buildEssayFromSelection,
  buildLinkPatch,
  type AddCardArgs,
} from "@/lib/source-reader/build-essay-payload";
import { commitMappingCreated } from "@/lib/services/sourceEditingService";
import { usePlannerMutations } from "@/hooks/planner/usePlannerMutations";

type AddCardFn = ReturnType<typeof useCardOnlyActions>["addCard"];

function dispatchAdd(addCard: AddCardFn, a: AddCardArgs) {
  addCard(a.question, a.sections, a.categoryId, a.subId, a.chapId, a.options);
}

/**
 * Selection→Essay mapping actions for the source reader. Pure orchestration:
 * builders live in `build-essay-payload`, side-effects in `commitMappingCreated`.
 *
 * BubbleMenu callers pass `(text, html)` directly. ExamSidebar mapping reads
 * the *current* TipTap selection via a parent-supplied getter
 * (`getSelectionPayload`) so we never reach into `window.getSelection()`.
 */
export function useSourceMapping(source: Source) {
  const { addCard, patchCard } = useCardOnlyActions();
  const { incrementMapped } = usePlannerMutations();
  const commitMapping = (count: number) => {
    if (count <= 0) return;
    incrementMapped.mutate(count);
    commitMappingCreated(count, { skipPlanner: true });
  };

  const handleConvertToEssay = useCallback((text: string, html: string) => {
    const {
      setSplitResult, setSplitSummaryOpen, setSplitMode, initSplitWizard,
    } = useSourceReaderStore.getState();
    if (!text || text.trim().length === 0) return;
    const plainSnippet = text.trim();
    const safe = sanitizeHtml(html || `<p>${text}</p>`);
    const fallbackTitle = firstWords(plainSnippet, 7) || "Novi esej";
    const singleModule: SelectionModule = {
      id: crypto.randomUUID(),
      articleNum: "",
      title: fallbackTitle,
      contentText: plainSnippet,
      contentHtml: safe,
      plainSnippet,
    };
    setSplitResult({ modules: [singleModule], rangeLabel: fallbackTitle, parentName: fallbackTitle });
    initSplitWizard([singleModule], fallbackTitle);
    setSplitMode("combined");
    setSplitSummaryOpen(true);
  }, []);

  const handleSmartSplitConfirm = useCallback(async () => {
    const {
      splitResult, splitModules, splitEdits, splitParentName, splitMode,
      wizardSubcategoryId, wizardChapterId,
      setSplitCreatedCount, setSplitDone,
    } = useSourceReaderStore.getState();
    if (!splitResult || splitModules.length === 0) return;
    const subId = wizardSubcategoryId || undefined;
    const chapId = wizardChapterId || undefined;

    if (splitMode === "separate") {
      const argsList = buildSeparateEssaysFromModules(splitModules, splitEdits, source, subId, chapId);
      if (argsList.length === 0) {
        toast.error("Svi članovi su preskočeni — ništa za kreirati.");
        return;
      }
      for (const args of argsList) dispatchAdd(addCard, args);
      setSplitCreatedCount(argsList.length);
      setSplitDone(true);
      commitMapping(argsList.length);
      toast.success(`Generisano ${argsList.length} kartica`, { description: `Iz "${source.title}"` });
      return;
    }

    const args = buildCombinedEssayFromModules(
      splitModules, splitEdits,
      splitParentName || splitResult.parentName,
      source, subId, chapId,
    );
    if (!args) {
      toast.error("Svi članovi su preskočeni — ništa za kreirati.");
      return;
    }
    dispatchAdd(addCard, args);
    const moduleCount = args.options?.sourceModules?.length ?? 1;
    setSplitCreatedCount(moduleCount);
    setSplitDone(true);
    commitMapping(moduleCount);
    toast.success(`Generisano 1 esej sa ${moduleCount} modula`, {
      description: `${splitResult.rangeLabel} iz "${source.title}"`,
    });
    // commitMapping is stable (created in parent with useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, addCard]);

  const handleLinkToExisting = useCallback((text: string, html: string) => {
    const { setLinkSelectedText, setLinkSelectedHtml, setLinkModalOpen } =
      useSourceReaderStore.getState();
    if (!text) return;
    setLinkSelectedText(text);
    setLinkSelectedHtml(html);
    setLinkModalOpen(true);
  }, []);

  const handleLinkConfirm = useCallback((cardId: string, appendSnippet: boolean = true) => {
    const {
      linkSelectedText, linkSelectedHtml,
      setLinkModalOpen, setLinkSelectedText, setLinkSelectedHtml,
    } = useSourceReaderStore.getState();
    patchCard(cardId, (c) => buildLinkPatch(c, linkSelectedText, linkSelectedHtml, source.id, appendSnippet));
    setLinkModalOpen(false);
    setLinkSelectedText("");
    setLinkSelectedHtml("");
    toast.success("Esej uspješno povezan!", { description: `Povezano sa izvorom "${source.title}"` });
  }, [patchCard, source.id, source.title]);

  const handleMapSelection = useCallback((
    questionId: string,
    payload: { text: string; html: string } | null,
  ) => {
    const { examQuestions, setExamQuestions } = useSourceReaderStore.getState();
    if (!payload || !payload.text) return;
    const question = examQuestions.find((q) => q.id === questionId);
    if (!question) return;
    const result = buildEssayFromSelection(payload.text, payload.html, question.text, source);
    dispatchAdd(addCard, result.args);
    setExamQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, done: true, moduleCount: result.moduleCount } : q)),
    );
    commitMapping(result.moduleCount);
    if (result.moduleCount > 1 && result.rangeLabel) {
      toast.success(`Esej kreiran: ${result.moduleCount} modula`, {
        description: `${result.rangeLabel} → "${question.text.slice(0, 50)}..."`,
      });
    } else {
      toast.success("Esej kreiran", { description: `"${question.text.slice(0, 60)}..."` });
    }
    // commitMapping is stable (created in parent with useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, addCard]);

  return {
    handleConvertToEssay,
    handleSmartSplitConfirm,
    handleLinkToExisting,
    handleLinkConfirm,
    handleMapSelection,
  };
}
