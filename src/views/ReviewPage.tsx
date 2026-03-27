import { useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { useSessionContext, QueuedReview, QueuedError } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ReviewSession from "@/components/ReviewSession";
import EmptyState from "@/components/EmptyState";

export default function ReviewPage() {
  const { dueCards, cards, reviewLog, subcategories, srSettings, reviewSection, logError } = useCardContext();
  const { setView } = useUIContext();
  const session = useSessionContext();
  const [searchParams] = useSearchParams();
  const preSelectedCategory = searchParams.get("category") || null;

  // Start session on mount
  useEffect(() => {
    session.startSession(cards, reviewLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    if (session.isSessionActive) {
      session.queueReview(cardId, sectionId, grade);
    }
    reviewSection(cardId, sectionId, grade);
  }, [session, reviewSection]);

  const handleLogError = useCallback((cardId: string, text: string) => {
    if (session.isSessionActive) {
      session.queueError(cardId, text);
    }
    logError(cardId, text);
  }, [session, logError]);

  const handleBack = useCallback(() => {
    if (session.isSessionActive) {
      session.endSession(
        (_reviews: QueuedReview[]) => {},
        (_errors: QueuedError[]) => {},
        () => {},
      );
    }
    setView("dashboard");
  }, [session, setView]);

  return (
    <ErrorBoundary label="Ponavljanje" onNavigateHome={() => setView("dashboard")}>
      {dueCards.length === 0 ? (
        <EmptyState type="review" />
      ) : (
        <ReviewSession
          dueCards={dueCards}
          allCards={cards}
          subcategories={subcategories}
          srSettings={srSettings}
          onReviewSection={handleReviewSection}
          onLogError={handleLogError}
          onBack={handleBack}
          preSelectedCategory={preSelectedCategory}
        />
      )}
    </ErrorBoundary>
  );
}
