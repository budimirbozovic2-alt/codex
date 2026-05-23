import { useCallback } from "react";
import { toast } from "sonner";
import { useCardOnlyActions } from "@/contexts/AppContext";
import { type Source } from "@/lib/sources-storage";
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

type AddCardFn = ReturnType<typeof useCardOnlyActions>["addCard"];

function dispatchAdd(addCard: AddCardFn, a: AddCardArgs) {
  addCard(a.question, a.sections, a.categoryId, a.subId, a.chapId, a.options);
}

/**
 * Selection→Essay mapping actions for the source reader. Pure orchestration:
 * builders live in `build-essay-payload`, side-effects in `commitMappingCreated`.
 */
export function useSourceMapping(source: Source) {
  const { addCard, patchCard } = useCardOnlyActions();

  const handleConvertToEssay = useCallback(() => {
    const {
      selection, setSelection, setSplitResult, setSplitSummaryOpen,
      setSplitMode, initSplitWizard,
    } = useSourceReaderStore.getState();
    if (!selection) return;
    const text = selection.text;
    const html = selection.html;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const plainSnippet = text.trim();
    const safe = sanitizeHtml(html || `<p>${text}</p>`);
    const fallbackTitle = firstWords(plainSnippet, 7) || "Novi esej";
    const singleModule: SelectionModule = {
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
      commitMappingCreated(argsList.length);
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
    commitMappingCreated(moduleCount);
    toast.success(`Generisano 1 esej sa ${moduleCount} modula`, {
      description: `${splitResult.rangeLabel} iz "${source.title}"`,
    });
  }, [source, addCard]);

  const handleLinkToExisting = useCallback(() => {
    const { selection, setLinkSelectedText, setLinkSelectedHtml, setLinkModalOpen, setSelection } =
      useSourceReaderStore.getState();
    if (!selection) return;
    setLinkSelectedText(selection.text);
    setLinkSelectedHtml(selection.html);
    setLinkModalOpen(true);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
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

  const handleMapSelection = useCallback((questionId: string) => {
    const { selection, examQuestions, setSelection, setExamQuestions } = useSourceReaderStore.getState();
    if (!selection) return;
    const text = selection.text;
    const html = selection.html;
    const question = examQuestions.find((q) => q.id === questionId);
    if (!question) return;
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    const result = buildEssayFromSelection(text, html, question.text, source);
    dispatchAdd(addCard, result.args);
    setExamQuestions((prev) =>
      prev.map((q) => (q.id === questionId ? { ...q, done: true, moduleCount: result.moduleCount } : q)),
    );
    commitMappingCreated(result.moduleCount);
    if (result.moduleCount > 1 && result.rangeLabel) {
      toast.success(`Esej kreiran: ${result.moduleCount} modula`, {
        description: `${result.rangeLabel} → "${question.text.slice(0, 50)}..."`,
      });
    } else {
      toast.success("Esej kreiran", { description: `"${question.text.slice(0, 60)}..."` });
    }
  }, [source, addCard]);

  return {
    handleConvertToEssay,
    handleSmartSplitConfirm,
    handleLinkToExisting,
    handleLinkConfirm,
    handleMapSelection,
  };
}
