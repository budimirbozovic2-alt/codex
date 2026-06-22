import ReviewSetup from "./review/ReviewSetup";
import ReviewCard from "./review/ReviewCard";
import ReviewComplete from "./review/ReviewComplete";
import { SessionCardSkeleton } from "@/components/ui/loading";
import { ReviewSessionProps } from "./review/review-constants";
import { useReviewSession } from "@/hooks/useReviewSession";

export default function ReviewSession(props: ReviewSessionProps) {
  const session = useReviewSession(props);

  if (session.mode === null) {
    if (session.savedSessionLoading) {
      return <SessionCardSkeleton />;
    }
    return (
      <ReviewSetup
        dueCards={session.dueCards}
        allCards={session.allCards}
        categoryRecords={session.categoryRecords}
        subcategories={{}}
        srSettings={session.srSettings}
        onSelectMode={session.handleSelectMode}
        onBack={session.onBack}
        savedSession={session.savedSession}
        onResumeSession={session.resumeSession}
        onClearSavedSession={session.handleClearSavedSession}
        lockedCategory={session.lockedCategory}
      />
    );
  }

  if (session.finished || !session.currentItem) {
    return (
      <ReviewComplete
        onBack={session.onBack}
        sessionStartTime={session.reviewStartTime}
        totalGrades={session.sessionGrades}
        sectionsReviewed={session.items.length}
      />
    );
  }

  return (
    <ReviewCard
      card={session.currentItem.card}
      section={session.currentItem.section}
      showAnswer={session.showAnswer}
      setShowAnswer={session.setShowAnswer}
      onGrade={session.handleGrade}
      onLogError={session.onLogError}
      onBack={session.autoMode ? session.handleExitSession : session.handleBackToSetup}
      onPause={session.handlePauseSession}
      progress={session.randomIndex}
      total={session.items.length}
      sectionIndex={session.sectionIndex}
      totalSectionsInCard={session.totalSectionsInCard}
      srSettings={session.srSettings}
      viewWidth={session.viewWidth}
      onViewWidthChange={session.setViewWidth}
      modeBadge={session.modeBadge}
      lockedCategoryName={session.lockedCategoryName}
    />
  );
}
