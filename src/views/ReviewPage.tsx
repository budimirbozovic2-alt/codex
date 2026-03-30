import { useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { useSessionContext, QueuedReview, QueuedError } from "@/contexts/SessionContext";
import { SectionState } from "@/lib/spaced-repetition";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ReviewSession from "@/components/ReviewSession";
import EmptyState from "@/components/EmptyState";

export default function ReviewPage() {
  const { dueCards, cards, categoryRecords, reviewLog, subcategories, srSettings, reviewSection, logError, ready } = useCardContext();
  const { setView } = useUIContext();
  const session = useSessionContext();
  const [searchParams] = useSearchParams();
  const preSelectedCategory = searchParams.get("category") || null;

  useEffect(() => {
    if (ready) session.startSession(cards, reviewLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // FSRS diagnostics for empty state
  const diagnostics = useMemo(() => {
    let newSections = 0;
    let reviewSections = 0;
    let nextDue = Infinity;
    for (const card of cards) {
      for (const s of card.sections) {
        if (s.state === SectionState.New) {
          newSections++;
        } else {
          reviewSections++;
          if (s.nextReview < nextDue) nextDue = s.nextReview;
        }
      }
    }
    const now = Date.now();
    let nextDueDate: string | undefined;
    if (nextDue !== Infinity && nextDue > now) {
      const d = new Date(nextDue);
      nextDueDate = d.toLocaleDateString("sr-Latn-BA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    return { totalCards: cards.length, newSections, reviewSections, nextDueDate };
  }, [cards]);

  const handleReviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    if (session.isSessionActive) {
      session.queueReview(cardId, sectionId, grade);
    }
    reviewSection(cardId, sectionId, grade);
  }, [session, reviewSection]);

  const handleLogError = useCallback((cardId: string, text: string, sectionId?: string) => {
    if (session.isSessionActive) {
      session.queueError(cardId, text);
    }
    logError(cardId, text, sectionId);
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

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Priprema gradiva...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Ponavljanje" onNavigateHome={() => setView("dashboard")}>
      {dueCards.length === 0 ? (
        <EmptyState type="review" />
      ) : (
        <ReviewSession
          dueCards={dueCards}
          allCards={cards}
          categoryRecords={categoryRecords}
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
