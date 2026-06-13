import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import ExamSidebar from "@/components/ExamSidebar";
import { cn } from "@/lib/utils";
import type { Source } from "@/domains/sources/sources-storage";
import { useSourceMutations } from "@/hooks/source/useSourceMutations";
import { useSourceReaderStore, WIDTH_CLASSES } from "@/store";
import { taskScheduler, type TaskHandle } from "@/lib/scheduler";

import { useSourceReaderActions } from "@/hooks/useSourceReaderActions";
import { SourceToolbar } from "@/components/source-reader/SourceToolbar";
import { SourceContent } from "@/components/source-reader/SourceContent";
import { SourceNavigation } from "@/components/source-reader/SourceNavigation";
import { SourceBubbleMenu } from "@/components/source-reader/SourceBubbleMenu";
import { SmartSplitSummaryDialog } from "@/components/source-reader/SmartSplitSummaryDialog";
import { docToHtml, type Editor } from "@/lib/editor-v4";
import { toast } from "sonner";
import { createMnemonicCardFromSelection, loadMnemonicCards } from "@/domains/mnemonic";
import { useMnemonicMutations } from "@/hooks/mnemonic/useMnemonicMutations";

import { logger } from "@/lib/logger";
const AutoSplitDialog = lazy(() => import("@/components/AutoSplitDialog"));
const LinkToExistingCardModal = lazy(() => import("@/components/LinkToExistingCardModal"));

interface Props {
  source: Source;
  onBack: () => void;
  onSourceUpdated?: (source: Source) => void;
}

export default function SourceReader({ source, onBack, onSourceUpdated }: Props) {
  const { derived, actions } = useSourceReaderActions(source, onSourceUpdated);

  const readerWidth = useSourceReaderStore(s => s.readerWidth);
  const outlineOpen = useSourceReaderStore(s => s.outlineOpen);
  const examOpen = useSourceReaderStore(s => s.examOpen);
  const editMode = useSourceReaderStore(s => s.editMode);
  const autoSplitOpen = useSourceReaderStore(s => s.autoSplitOpen);
  const linkModalOpen = useSourceReaderStore(s => s.linkModalOpen);
  const linkSelectedText = useSourceReaderStore(s => s.linkSelectedText);
  const linkSelectedHtml = useSourceReaderStore(s => s.linkSelectedHtml);
  const examQuestions = useSourceReaderStore(s => s.examQuestions);
  const setExamQuestions = useSourceReaderStore(s => s.setExamQuestions);

  const [editor, setEditor] = useState<Editor | null>(null);
  const handleEditorReady = useCallback((e: Editor | null) => setEditor(e), []);

  /** Compute current TipTap selection payload (text + html via docToHtml). */
  const getSelectionPayload = useCallback((): { text: string; html: string } | null => {
    if (!editor) return null;
    const { state } = editor;
    const { from, to, empty } = state.selection;
    if (empty) return null;
    const text = state.doc.textBetween(from, to, "\n", " ").trim();
    if (text.length < 5) return null;
    const slice = state.doc.slice(from, to);
    const docJson = { type: "doc", content: slice.content.toJSON() as unknown as never[] };
    return { text, html: docToHtml({ version: 4, content: docJson }) };
  }, [editor]);

  const { saveCards: saveMnemoCards } = useMnemonicMutations();
  const { save: saveSourceMutation } = useSourceMutations();
  const handleMnemoFromSelection = useCallback(async (text: string) => {
    const cards = await loadMnemonicCards();
    const clone = createMnemonicCardFromSelection(
      source.id, source.title, text, source.categoryId, undefined, []
    );
    await saveMnemoCards.mutateAsync([...cards, clone]);
    toast("Dodano u Mnemo radionicu", { description: `"${text.slice(0, 40)}${text.length > 40 ? "…" : ""}"` });
  }, [source.id, source.title, source.categoryId, saveMnemoCards]);

  const handleMapWithSelection = useCallback((qId: string) => {
    actions.handleMapSelection(qId, getSelectionPayload());
  }, [actions, getSelectionPayload]);

  // Rehydrate per-source examQuestions on mount/source switch
  const hydratedSourceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedSourceIdRef.current === source.id) return;
    hydratedSourceIdRef.current = source.id;
    setExamQuestions(source.examQuestions ?? []);
  }, [source.id, source.examQuestions, setExamQuestions]);

  // Debounced silent save back to the Source record
  const saveTimerRef = useRef<TaskHandle | null>(null);
  const lastSavedJsonRef = useRef<string>(JSON.stringify(source.examQuestions ?? []));
  const sourceRef = useRef(source);
  const onSourceUpdatedRef = useRef(onSourceUpdated);
  useEffect(() => { sourceRef.current = source; }, [source]);
  useEffect(() => { onSourceUpdatedRef.current = onSourceUpdated; }, [onSourceUpdated]);

  useEffect(() => {
    if (hydratedSourceIdRef.current !== source.id) return;
    const json = JSON.stringify(examQuestions);
    if (json === lastSavedJsonRef.current) return;
    if (saveTimerRef.current !== null) taskScheduler.cancel(saveTimerRef.current);
    saveTimerRef.current = taskScheduler.setTimeout(() => {
      saveTimerRef.current = null;
      lastSavedJsonRef.current = json;
      const current = sourceRef.current;
      const next: Source = { ...current, examQuestions, updatedAt: Date.now() };
      saveSourceMutation.mutateAsync(next)
        .then(() => onSourceUpdatedRef.current?.(next))
        .catch(err => {
          logger.error("[SourceReader] failed to persist examQuestions", err);
        });
    }, 800, { label: `source-reader:exam-questions:${source.id}` });
    return () => {
      if (saveTimerRef.current !== null) {
        taskScheduler.cancel(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [examQuestions, source.id, saveSourceMutation]);

  useEffect(() => () => useSourceReaderStore.getState().reset(), []);

  const hasSelection = !!getSelectionPayload();

  return (
    <div className="space-y-4">
      <SourceToolbar
        source={source}
        onBack={onBack}
        onAutoSplit={() => useSourceReaderStore.getState().setAutoSplitOpen(true)}
        onAutoFormat={actions.handleAutoFormatArticles}
      />

      <div className="flex gap-4">
        {outlineOpen && (
          <SourceNavigation
            source={source}
            onScrollToHeading={actions.scrollToHeading}
          />
        )}

        <div className={cn("flex-1 min-w-0 relative mx-auto px-6", WIDTH_CLASSES[readerWidth])}>
          <SourceContent
            source={source}
            editMode={editMode}
            onSourceUpdated={onSourceUpdated}
            onEditorReady={handleEditorReady}
          />

          {editor && (
            <SourceBubbleMenu
              editor={editor}
              editMode={editMode}
              onSplit={actions.handleConvertToEssay}
              onLinkToExisting={actions.handleLinkToExisting}
              onAddMnemo={handleMnemoFromSelection}
            />
          )}
        </div>

        {examOpen && (
          <ExamSidebar
            questions={examQuestions}
            onSetQuestions={setExamQuestions}
            onMapSelection={handleMapWithSelection}
            hasSelection={hasSelection}
          />
        )}
      </div>

      <SmartSplitSummaryDialog
        source={source}
        onSmartSplitConfirm={actions.handleSmartSplitConfirm}
      />

      <Suspense fallback={null}>
        {autoSplitOpen && (
          <AutoSplitDialog
            open={autoSplitOpen}
            onClose={() => useSourceReaderStore.getState().setAutoSplitOpen(false)}
            source={source}
          />
        )}
        {linkModalOpen && (
          <LinkToExistingCardModal
            open={linkModalOpen}
            onOpenChange={useSourceReaderStore.getState().setLinkModalOpen}
            sourceId={source.id}
            sourceLabel={source.categoryId || source.title || ""}
            selectedText={linkSelectedText}
            selectedHtml={linkSelectedHtml}
            cards={derived.cards}
            onLink={actions.handleLinkConfirm}
          />
        )}
      </Suspense>
    </div>
  );
}
