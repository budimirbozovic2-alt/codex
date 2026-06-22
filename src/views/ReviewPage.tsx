import { useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useSearchParams } from "react-router-dom";
import { useCardOnlyActions } from "@/hooks/cards/useActions";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardData, useReviewData } from "@/hooks/cards/useCardState";
import { useUIContext } from "@/hooks/useUI";
import { useSessionContext, QueuedReview, QueuedError } from "@/store/useSessionStore";
import { SectionState } from "@/lib/spaced-repetition";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ReviewSession from "@/components/ReviewSession";
import EmptyState from "@/components/EmptyState";
import { getParam } from "@/lib/url-params";
import { hasConsolidationWork, countConsolidationEligibleCards } from "@/lib/review-mode-builder";
import { countScheduleDueCards } from "@/lib/sr/schedule-due";
import { DataReadyGate, SessionSetupSkeleton } from "@/components/ui/loading";

export default function ReviewPage() {
  const { cards, dueCards, ready } = useCardData();
  const { categoryRecords } = useCategoryData();
  const { reviewLog, srSettings } = useReviewData();
  const { reviewSection, logError } = useCardOnlyActions();
  const { setView } = useUIContext();
  const session = useSessionContext();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const lockedCategory = getParam(searchParams, "category");
  const modeParam = getParam(searchParams, "mode");
  const autoMode = (modeParam === "critical" || modeParam === "stabilization" || modeParam === "hardest" || modeParam === "catchup")
    ? modeParam
    : undefined;

  const scopedDueCards = useMemo(
    () => lockedCategory ? dueCards.filter(c => c.categoryId === lockedCategory) : dueCards,
    [dueCards, lockedCategory],
  );
  const scopedAllCards = useMemo(
    () => lockedCategory ? cards.filter(c => c.categoryId === lockedCategory) : cards,
    [cards, lockedCategory],
  );

  useEffect(() => {
    if (ready) session.startSession(scopedAllCards, reviewLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, lockedCategory, location.key]);

  const diagnostics = useMemo(() => {
    let newSections = 0;
    let reviewSections = 0;
    let nextDue = Infinity;
    for (const card of scopedAllCards) {
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
    return { totalCards: scopedAllCards.length, newSections, reviewSections, nextDueDate };
  }, [scopedAllCards]);

  const buildArgs = useMemo(
    () => ({
      dueCards: scopedDueCards,
      allCards: scopedAllCards,
      srSettings,
    }),
    [scopedDueCards, scopedAllCards, srSettings],
  );

  const consolidationAvailable = useMemo(
    () => hasConsolidationWork(buildArgs),
    [buildArgs],
  );

  const scheduleDueCount = useMemo(
    () => countScheduleDueCards(scopedAllCards),
    [scopedAllCards],
  );

  const consolidationDueCount = useMemo(
    () => countConsolidationEligibleCards(buildArgs),
    [buildArgs],
  );

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

  return (
    <DataReadyGate ready={ready} skeleton={<SessionSetupSkeleton />}>
      <ErrorBoundary label="Ponavljanje" onNavigateHome={() => setView("dashboard")}>
        {!consolidationAvailable ? (
          <EmptyState
            type="review"
            diagnostics={{
              ...diagnostics,
              scheduleDueCards: scheduleDueCount,
              consolidationDueCards: consolidationDueCount,
            }}
          />
        ) : (
          <ReviewSession
            dueCards={scopedDueCards}
            allCards={scopedAllCards}
            categoryRecords={categoryRecords}
            reviewLog={reviewLog}
            srSettings={srSettings}
            onReviewSection={handleReviewSection}
            onLogError={handleLogError}
            onBack={handleBack}
            lockedCategory={lockedCategory}
            autoMode={autoMode}
          />
        )}
      </ErrorBoundary>
    </DataReadyGate>
  );
}
