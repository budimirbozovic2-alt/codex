import { lazy, Suspense } from "react";
import ExamSidebar from "@/components/ExamSidebar";
import CoverageArticleList from "@/components/source-reader/CoverageArticleList";
import { cn } from "@/lib/utils";
import type { Source } from "@/lib/sources-storage";
import { useSourceReaderLogic, WIDTH_CLASSES } from "@/hooks/useSourceReaderLogic";
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
  /** The source to be read and managed */
  source: Source;
  /** Callback to return to the previous view */
  onBack: () => void;
  /** Optional callback when the source data is modified */
  onSourceUpdated?: (source: Source) => void;
}

/**
 * Main container component for the Source Reader view.
 * This component orchestrates all sub-components and logic related to reading,
 * editing, and mapping cards from a source document.
 */
export default function SourceReader({ source, onBack, onSourceUpdated }: Props) {
  const { state, actions, refs } = useSourceReaderLogic(source, onSourceUpdated);
  const isCoverage = state.viewMode === "coverage";

  return (
    <div className="space-y-4">
      {/* Top navigation and settings bar */}
      <SourceToolbar
        source={source}
        onBack={onBack}
        viewMode={state.viewMode}
        setViewMode={actions.setViewMode}
        examOpen={state.examOpen}
        setExamOpen={actions.setExamOpen}
        examQuestions={state.examQuestions}
        outlineOpen={state.outlineOpen}
        setOutlineOpen={actions.setOutlineOpen}
        onAutoSplit={() => actions.setAutoSplitOpen(true)}
        readerWidth={state.readerWidth}
        setReaderWidth={actions.setReaderWidth}
        editMode={state.editMode}
        setEditMode={actions.setEditMode}
      />

      {/* Progress indicator for card coverage */}
      {isCoverage && (
        <CoverageStatsBar 
          percent={state.coverage.percent} 
          linkedCount={state.linkedCount} 
        />
      )}

      <div className="flex gap-4">
        {/* Left sidebar: Outline navigation */}
        {state.outlineOpen && (
          <SourceNavigation 
            source={source} 
            onScrollToHeading={actions.scrollToHeading} 
          />
        )}

        {/* Main content area: Reader or Coverage List */}
        <div 
          className={cn("flex-1 min-w-0 relative mx-auto px-6", WIDTH_CLASSES[state.readerWidth])} 
          onContextMenu={actions.handleContextMenu}
        >
          {isCoverage ? (
            <CoverageArticleList 
              source={source} 
              cards={state.cards} 
              onOpenCard={actions.handleOpenCoveredCard} 
            />
          ) : (
            <SourceContent 
              html={state.safeHtml} 
              onMouseUp={actions.handleMouseUp} 
              contentRef={refs.contentRef} 
            />
          )}

          {/* Floating context menu for formatting blocks (Edit mode only) */}
          {state.headingMenu && (
            <SourceContextMenu
              menu={state.headingMenu}
              onSetHeading={actions.handleSetHeading}
              onFormatAsList={actions.handleFormatAsList}
              onClose={() => actions.setHeadingMenu(null)}
            />
          )}

          {/* Floating action tooltip for selected text */}
          {!isCoverage && state.selection && (
            <SourceTooltip
              selection={state.selection}
              editMode={state.editMode}
              onConvertToEssay={actions.handleConvertToEssay}
              onLinkToExisting={actions.handleLinkToExisting}
              onFormatSelectionAs={actions.handleFormatSelectionAs}
            />
          )}
        </div>

        {/* Right sidebar: Exam mapping logic */}
        {state.examOpen && (
          <ExamSidebar
            questions={state.examQuestions}
            onSetQuestions={actions.setExamQuestions}
            onMapSelection={actions.handleMapSelection}
            hasSelection={!!state.selection}
          />
        )}
      </div>

      {/* Dialog for creating a single essay card */}
      <EssayCreationDialog
        open={state.essayDialogOpen}
        onOpenChange={actions.setEssayDialogOpen}
        essayQuestion={state.essayQuestion}
        setEssayQuestion={actions.setEssayQuestion}
        selectedText={state.selectedText}
        source={source}
        onCreateEssay={actions.handleCreateEssay}
      />

      {/* Dialog for summarizing and confirming a smart-split operation */}
      <SmartSplitSummaryDialog
        open={state.splitSummaryOpen}
        onOpenChange={(o) => { 
          if (!o) { 
            actions.setSplitSummaryOpen(false); 
            actions.setSplitResult(null); 
          } 
        }}
        splitDone={state.splitDone}
        splitResult={state.splitResult}
        splitCreatedCount={state.splitCreatedCount}
        source={source}
        splitParentName={state.splitParentName}
        setSplitParentName={actions.setSplitParentName}
        splitModules={state.splitModules}
        setSplitModules={actions.setSplitModules}
        onSmartSplitConfirm={actions.handleSmartSplitConfirm}
      />

      {/* Lazy-loaded modals for bulk operations */}
      <Suspense fallback={null}>
        {state.autoSplitOpen && (
          <AutoSplitDialog 
            open={state.autoSplitOpen} 
            onClose={() => actions.setAutoSplitOpen(false)} 
            source={source} 
          />
        )}
        {state.linkModalOpen && (
          <LinkToExistingCardModal
            open={state.linkModalOpen}
            onOpenChange={actions.setLinkModalOpen}
            sourceId={source.id}
            sourceLabel={source.categoryId || source.title || ""}
            selectedText={state.linkSelectedText}
            cards={state.cards}
            onLink={actions.handleLinkConfirm}
          />
        )}
      </Suspense>
    </div>
  );
}
