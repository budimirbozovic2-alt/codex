import { useEffect, useCallback } from "react";
import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { useSessionContext, QueuedReview, QueuedError, QueuedMarkRead } from "@/contexts/SessionContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LearnSession from "@/components/LearnSession";
import { Card } from "@/lib/spaced-repetition";

export default function LearnPage() {
  const { cards, categories, categoryRecords, subcategories, markRead, reviewSection, stats, reviewLog, addKeyPart } = useCardContext();
  const { setView, setEditingCard } = useUIContext();
  const session = useSessionContext();

  useEffect(() => {
    session.startSession(cards, reviewLog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return (
    <ErrorBoundary label="Učenje" onNavigateHome={() => setView("dashboard")}>
      <LearnSession
        cards={cards}
        categories={categories}
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
