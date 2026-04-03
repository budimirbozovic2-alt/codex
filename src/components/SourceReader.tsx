import { lazy, Suspense, useEffect, useMemo } from "react";
import ExamSidebar from "@/components/ExamSidebar";
import CoverageArticleList from "@/components/source-reader/CoverageArticleList";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderStore, WIDTH_CLASSES } from "@/store/useSourceReaderStore";
import { useSourceReaderActions } from "@/hooks/useSourceReaderActions";
import { SourceToolbar } from "@/components/source-reader/SourceToolbar";
import { SourceContent } from "@/components/source-reader/SourceContent";
import { SourceNavigation } from "@/components/source-reader/SourceNavigation";
import { CoverageStatsBar } from "@/components/source-reader/CoverageStatsBar";
import { SourceContextMenu } from "@/components/source-reader/SourceContextMenu";
import { SourceTooltip } from "@/components/source-reader/SourceTooltip";
import { EssayCreationDialog } from "@/components/source-reader/EssayCreationDialog";
import { SmartSplitSummaryDialog } from "@/components/source-reader/SmartSplitSummaryDialog";

const AutoSplitDialog = lazy(() => import("@/components/AutoSplitDialog"));
const LinkToExistingCardModal = lazy(() => import("@/components/LinkToExistingCardModal"));

interface Props {
  source: Source;
  onBack: () => void;
  onSourceUpdated?: (source: Source) => void;
}

export default function SourceReader({ source, onBack, onSourceUpdated }: Props) {
  const { contentRef, derived, actions } = useSourceReaderActions(source, onSourceUpdated);

  // Granular store selectors
  const viewMode = useSourceReaderStore(s => s.viewMode);
  const readerWidth = useSourceReaderStore(s => s.readerWidth);
  const outlineOpen = useSourceReaderStore(s => s.outlineOpen);
  const examOpen = useSourceReaderStore(s => s.examOpen);
  const editMode = useSourceReaderStore(s => s.editMode);
  const selection = useSourceReaderStore(s => s.selection);
  const headingMenu = useSourceReaderStore(s => s.headingMenu);
  const essayDialogOpen = useSourceReaderStore(s => s.essayDialogOpen);
  const splitSummaryOpen = useSourceReaderStore(s => s.splitSummaryOpen);
  const autoSplitOpen = useSourceReaderStore(s => s.autoSplitOpen);
  const linkModalOpen = useSourceReaderStore(s => s.linkModalOpen);
  const linkSelectedText = useSourceReaderStore(s => s.linkSelectedText);
  const examQuestions = useSourceReaderStore(s => s.examQuestions);
  const setExamQuestions = useSourceReaderStore(s => s.setExamQuestions);

  // Reset store on unmount
  useEffect(() => () => useSourceReaderStore.getState().reset(), []);

  const isCoverage = viewMode === "coverage";

  return (
    <div className="space-y-4">
      <SourceToolbar
        source={source}
        onBack={onBack}
        onAutoSplit={() => useSourceReaderStore.getState().setAutoSplitOpen(true)}
        onAutoFormat={actions.handleAutoFormatArticles}
      />

      {isCoverage && (
        <CoverageStatsBar
          percent={derived.coverage.percent}
          linkedCount={derived.linkedCount}
        />
      )}

      <div className="flex gap-4">
        {outlineOpen && (
          <SourceNavigation
            source={source}
            onScrollToHeading={actions.scrollToHeading}
          />
        )}

        <div
          className={cn("flex-1 min-w-0 relative mx-auto px-6", WIDTH_CLASSES[readerWidth])}
          onContextMenu={actions.handleContextMenu}
        >
          {isCoverage ? (
            <CoverageArticleList
              source={source}
              cards={derived.cards}
              onOpenCard={actions.handleOpenCoveredCard}
            />
          ) : (
            <SourceContent
              html={derived.safeHtml}
              onMouseUp={actions.handleMouseUp}
              contentRef={contentRef}
              editMode={editMode}
              onFormat={actions.handleInlineFormat}
              onInput={actions.handleEditInput}
            />
          )}

          {headingMenu && (
            <SourceContextMenu
              menu={headingMenu}
              onSetHeading={actions.handleSetHeading}
              onFormatAsList={actions.handleFormatAsList}
              onClose={() => useSourceReaderStore.getState().setHeadingMenu(null)}
            />
          )}

          {!isCoverage && selection && (
            <SourceTooltip
              selection={selection}
              editMode={editMode}
              onConvertToEssay={actions.handleConvertToEssay}
              onLinkToExisting={actions.handleLinkToExisting}
              onFormatSelectionAs={actions.handleFormatSelectionAs}
            />
          )}
        </div>

        {examOpen && (
          <ExamSidebar
            questions={examQuestions}
            onSetQuestions={setExamQuestions}
            onMapSelection={actions.handleMapSelection}
            hasSelection={!!selection}
          />
        )}
      </div>

      <EssayCreationDialog
        source={source}
        onCreateEssay={actions.handleCreateEssay}
      />

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
            cards={derived.cards}
            onLink={actions.handleLinkConfirm}
          />
        )}
      </Suspense>
    </div>
  );
}
