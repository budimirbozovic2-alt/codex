import { useEffect, useCallback } from "react";
import { useCardData, useCategoryData, useReviewData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { useSessionContext, QueuedReview, QueuedError, QueuedMarkRead } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LearnSession from "@/components/LearnSession";
import { Card } from "@/lib/spaced-repetition";

export default function LearnPage() {
  const { cards, stats, ready } = useCardData();
  const { categories, categoryRecords, subcategories } = useCategoryData();
  const { reviewLog } = useReviewData();
  const { markRead, reviewSection, addKeyPart } = useCardActions();
  const { setView, setEditingCard } = useUIContext();
  const session = useSessionContext();

  useEffect(() => {
    if (ready) session.startSession(cards, reviewLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleMarkRead = useCallback((id: string) => {
    if (session.isSessionActive) session.queueMarkRead(id);
    markRead(id);
  }, [session, markRead]);

  const handleReviewSection = useCallback((cardId: string, sectionId: string, grade: number) => {
    if (session.isSessionActive) session.queueReview(cardId, sectionId, grade);
    reviewSection(cardId, sectionId, grade);
  }, [session, reviewSection]);

  const handleBack = useCallback(() => {
    if (session.isSessionActive) {
      session.endSession(
        (_reviews: QueuedReview[]) => {},
        (_errors: QueuedError[]) => {},
        (_reads: QueuedMarkRead[]) => {},
      );
    }
    setView("dashboard");
  }, [session, setView]);

  const handleEdit = useCallback((card: Card) => {
    sessionStorage.setItem("sr-edit-return-view", "learn");
    setEditingCard(card);
    setView("edit");
  }, [setEditingCard, setView]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Priprema gradiva...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Učenje" onNavigateHome={() => setView("dashboard")}>
      <LearnSession
        cards={cards}
        categories={categories}
        categoryRecords={categoryRecords}
        subcategories={subcategories}
        onMarkRead={handleMarkRead}
        onReviewSection={handleReviewSection}
        onBack={handleBack}
        onEdit={handleEdit}
        onAddKeyPart={addKeyPart}
        dueCount={stats.due}
        reviewLog={reviewLog}
      />
    </ErrorBoundary>
  );
}
