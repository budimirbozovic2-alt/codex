import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import { type Source } from "@/domains/sources/sources-storage";
import { useSourceReaderStore } from "@/store";
import { deriveTitleAndBody, splitSelection, type SelectionModule } from "@/lib/selection-split-engine";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  buildCombinedEssayFromModules,
  buildEssayFromSelection,
  buildLinkPatch,
  type AddCardArgs,
} from "@/lib/source-reader/build-essay-payload";
import { commitMappingCreated } from "@/lib/services/sourceEditingService";
import { usePlannerMutations } from "@/hooks/planner/usePlannerMutations";
import type { SelectionPayload } from "@/lib/source-reader/selection-payload";

type AddCardFn = ReturnType<typeof useCardOnlyActions>["addCard"];

function dispatchAdd(addCard: AddCardFn, a: AddCardArgs) {
  return addCard(a.question, a.sections, a.categoryId, a.subId, a.chapId, a.options);
}

/**
 * Selection→Essay mapping actions for the source reader. Pure orchestration:
 * builders live in `build-essay-payload`, side-effects in `commitMappingCreated`.
 *
 * BubbleMenu callers pass `SelectionPayload` directly. ExamSidebar mapping reads
 * the *current* TipTap selection via a parent-supplied getter
 * (`getSelectionPayload`) so we never reach into `window.getSelection()`.
 */
export function useSourceMapping(source: Source) {
  const { addCard, patchCard } = useCardOnlyActions();
  const { incrementMapped } = usePlannerMutations();
  const commitMapping = useCallback((count: number) => {
    if (count <= 0) return;
    incrementMapped.mutate(count);
    commitMappingCreated(count, { skipPlanner: true });
  }, [incrementMapped]);

  const handleConvertToEssay = useCallback((payload: SelectionPayload) => {
    const { text, html, contentDoc } = payload;
    const {
      setSplitResult, setSplitSummaryOpen, initSplitWizard,
    } = useSourceReaderStore.getState();
    if (!text || text.trim().length === 0) return;
    const safe = sanitizeHtml(html || `<p>${text}</p>`);

    const split = source.sourceKind !== "skripta" ? splitSelection(text) : null;
    if (split?.hasArticles && split.modules.length > 0) {
      setSplitResult({
        modules: split.modules,
        rangeLabel: split.rangeLabel,
        parentName: split.parentName,
      });
      initSplitWizard(split.modules, split.parentName);
      setSplitSummaryOpen(true);
      return;
    }

    const { title, contentText, contentHtml, contentDoc: strippedDoc } = deriveTitleAndBody(
      text, safe, contentDoc,
    );
    const singleModule: SelectionModule = {
      id: crypto.randomUUID(),
      articleNum: "",
      title,
      contentText,
      contentHtml,
      contentDoc: strippedDoc,
      plainSnippet: contentText,
    };
    setSplitResult({ modules: [singleModule], rangeLabel: title, parentName: title });
    initSplitWizard([singleModule], title);
    setSplitSummaryOpen(true);
  }, [source.sourceKind]);

  const handleSmartSplitConfirm = useCallback(async () => {
    const {
      splitResult, splitModules, splitEdits, splitParentName,
      wizardSubcategoryId, wizardChapterId,
      setSplitCreatedCount, setSplitDone,
    } = useSourceReaderStore.getState();
    if (!splitResult || splitModules.length === 0) return;
    const subId = wizardSubcategoryId || undefined;
    const chapId = wizardChapterId || undefined;

    const args = buildCombinedEssayFromModules(
      splitModules, splitEdits,
      splitParentName || splitResult.parentName,
      source, subId, chapId,
    );
    if (!args) {
      toast.error("Svi članovi su preskočeni — ništa za kreirati.");
      return;
    }
    try {
      await dispatchAdd(addCard, args);
    } catch {
      return;
    }
    const moduleCount = args.options?.sourceModules?.length ?? 1;
    setSplitCreatedCount(moduleCount);
    setSplitDone(true);
    commitMapping(moduleCount);
    toast.success(`Generisano 1 esej sa ${moduleCount} modula`, {
      description: `${splitResult.rangeLabel} iz "${source.title}"`,
    });
  }, [source, addCard, commitMapping]);

  const handleLinkToExisting = useCallback((payload: SelectionPayload) => {
    const { text, html, contentDoc } = payload;
    const { setLinkSelectedText, setLinkSelectedHtml, setLinkSelectedDoc, setLinkModalOpen } =
      useSourceReaderStore.getState();
    if (!text) return;
    setLinkSelectedText(text);
    setLinkSelectedHtml(html);
    setLinkSelectedDoc(contentDoc);
    setLinkModalOpen(true);
  }, []);

  const handleLinkConfirm = useCallback((cardId: string, appendSnippet: boolean = true) => {
    const {
      linkSelectedText, linkSelectedHtml, linkSelectedDoc,
      setLinkModalOpen, setLinkSelectedText, setLinkSelectedHtml, setLinkSelectedDoc,
    } = useSourceReaderStore.getState();
    patchCard(cardId, (c) => buildLinkPatch(
      c, linkSelectedText, linkSelectedHtml, source.id, appendSnippet, linkSelectedDoc ?? undefined,
    ));
    setLinkModalOpen(false);
    setLinkSelectedText("");
    setLinkSelectedHtml("");
    setLinkSelectedDoc(null);
    toast.success("Esej uspješno povezan!", { description: `Povezano sa izvorom "${source.title}"` });
  }, [patchCard, source.id, source.title]);

  const handleMapSelection = useCallback(async (
    questionId: string,
    payload: SelectionPayload | null,
  ) => {
    const { examQuestions, setExamQuestions } = useSourceReaderStore.getState();
    if (!payload || !payload.text) return;
    const question = examQuestions.find((q) => q.id === questionId);
    if (!question) return;
    const result = buildEssayFromSelection(
      payload.text, payload.html, question.text, source, payload.contentDoc,
    );
    try {
      await dispatchAdd(addCard, result.args);
    } catch {
      return;
    }
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
  }, [source, addCard, commitMapping]);

  return useMemo(() => ({
    handleConvertToEssay,
    handleSmartSplitConfirm,
    handleLinkToExisting,
    handleLinkConfirm,
    handleMapSelection,
  }), [
    handleConvertToEssay,
    handleSmartSplitConfirm,
    handleLinkToExisting,
    handleLinkConfirm,
    handleMapSelection,
  ]);
}
