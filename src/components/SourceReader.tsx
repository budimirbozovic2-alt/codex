import { lazy, Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import ExamSidebar from "@/components/ExamSidebar";
import { cn } from "@/lib/utils";
import type { Source } from "@/domains/sources/sources-storage";
import { useSourceMutations } from "@/hooks/source/useSourceMutations";
import { useSourceReaderStore, WIDTH_CLASSES } from "@/store";
import type { Card } from "@/lib/spaced-repetition";
import { taskScheduler, type TaskHandle } from "@/lib/scheduler";

import { useSourceReaderActions } from "@/hooks/useSourceReaderActions";
import { useCardsBySource } from "@/store";
import { useSourceReaderShortcuts } from "@/hooks/source-reader/useSourceReaderShortcuts";
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

function sourceOutlineKey(outline: Source["outline"]): string {
  return JSON.stringify(outline ?? []);
}

interface Props {
  source: Source;
  onBack: () => void;
  onSourceUpdated?: (source: Source) => void;
}

export default memo(function SourceReader({ source, onBack, onSourceUpdated }: Props) {
  const { actions } = useSourceReaderActions(source, onSourceUpdated);

  const { readerWidth, outlineOpen, editMode } = useSourceReaderStore(
    useShallow((s) => ({
      readerWidth: s.readerWidth,
      outlineOpen: s.outlineOpen,
      editMode: s.editMode,
    })),
  );

  const [editor, setEditor] = useState<Editor | null>(null);
  const [liveOutline, setLiveOutline] = useState(source.outline ?? []);
  const handleEditorReady = useCallback((e: Editor | null) => setEditor(e), []);

  useEffect(() => {
    setLiveOutline(source.outline ?? []);
  }, [source.id, source.outline]);

  const navigationSource = useMemo(
    () => ({ ...source, outline: liveOutline }),
    [source, liveOutline],
  );

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

  const handleConvertShortcut = useCallback(() => {
    const payload = getSelectionPayload();
    if (!payload) return;
    actions.handleConvertToEssay(payload.text, payload.html);
  }, [getSelectionPayload, actions]);

  useSourceReaderShortcuts({ onConvertToEssay: handleConvertShortcut });

  useEffect(() => () => useSourceReaderStore.getState().reset(), []);

  const [hasSelection, setHasSelection] = useState(false);
  useEffect(() => {
    if (!editor) {
      setHasSelection(false);
      return;
    }
    const sync = () => setHasSelection(!!getSelectionPayload());
    sync();
    editor.on("selectionUpdate", sync);
    return () => {
      editor.off("selectionUpdate", sync);
    };
  }, [editor, getSelectionPayload]);

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
            source={navigationSource}
            onScrollToHeading={actions.scrollToHeading}
          />
        )}

        <div className={cn("flex-1 min-w-0 relative mx-auto px-6", WIDTH_CLASSES[readerWidth])}>
          <SourceContent
            source={source}
            editMode={editMode}
            onSourceUpdated={onSourceUpdated}
            onOutlineChange={setLiveOutline}
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

        <SourceReaderExamSidebar
          source={source}
          onSourceUpdated={onSourceUpdated}
          onMapSelection={handleMapWithSelection}
          hasSelection={hasSelection}
        />
      </div>

      <SmartSplitSummaryDialog
        source={source}
        onSmartSplitConfirm={actions.handleSmartSplitConfirm}
      />

      <SourceReaderLazyModals
        source={source}
        onLink={actions.handleLinkConfirm}
      />
    </div>
  );
}, (prev, next) =>
  prev.source.id === next.source.id
  && prev.source.updatedAt === next.source.updatedAt
  && prev.source.version === next.source.version
  && sourceOutlineKey(prev.source.outline) === sourceOutlineKey(next.source.outline)
  && prev.onBack === next.onBack
  && prev.onSourceUpdated === next.onSourceUpdated,
);

/** Isolated exam sidebar — avoids re-rendering the editor shell on question edits. */
function SourceReaderExamSidebar({
  source,
  onSourceUpdated,
  onMapSelection,
  hasSelection,
}: {
  source: Source;
  onSourceUpdated?: (s: Source) => void;
  onMapSelection: (qId: string) => void;
  hasSelection: boolean;
}) {
  const { examOpen, examQuestions, setExamQuestions } = useSourceReaderStore(
    useShallow((s) => ({
      examOpen: s.examOpen,
      examQuestions: s.examQuestions,
      setExamQuestions: s.setExamQuestions,
    })),
  );
  const { save: saveSourceMutation } = useSourceMutations();

  const hydratedSourceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedSourceIdRef.current === source.id) return;
    hydratedSourceIdRef.current = source.id;
    setExamQuestions(source.examQuestions ?? []);
  }, [source.id, source.examQuestions, setExamQuestions]);

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
      const current = sourceRef.current;
      const next: Source = { ...current, examQuestions, updatedAt: Date.now() };
      saveSourceMutation.mutateAsync(next)
        .then(() => {
          lastSavedJsonRef.current = json;
          onSourceUpdatedRef.current?.(next);
        })
        .catch(err => {
          logger.error("[SourceReader] failed to persist examQuestions", err);
          toast.error("Čuvanje ispitanih pitanja nije uspjelo");
        });
    }, 800, { label: `source-reader:exam-questions:${source.id}` });
    return () => {
      if (saveTimerRef.current !== null) {
        taskScheduler.cancel(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [examQuestions, source.id, saveSourceMutation]);

  if (!examOpen) return null;

  return (
    <ExamSidebar
      questions={examQuestions}
      onSetQuestions={setExamQuestions}
      onMapSelection={onMapSelection}
      hasSelection={hasSelection}
    />
  );
}

/** Lazy modals — isolated from layout/editor subscriptions. */
function SourceReaderLazyModals({
  source,
  onLink,
}: {
  source: Source;
  onLink: (cardId: string, appendSnippet?: boolean) => void;
}) {
  const {
    autoSplitOpen,
    linkModalOpen,
    linkSelectedText,
    linkSelectedHtml,
  } = useSourceReaderStore(
    useShallow((s) => ({
      autoSplitOpen: s.autoSplitOpen,
      linkModalOpen: s.linkModalOpen,
      linkSelectedText: s.linkSelectedText,
      linkSelectedHtml: s.linkSelectedHtml,
    })),
  );
  const sourceCards = useCardsBySource(linkModalOpen ? source.id : undefined);

  return (
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
          cards={sourceCards as Card[]}
          onLink={onLink}
        />
      )}
    </Suspense>
  );
}
