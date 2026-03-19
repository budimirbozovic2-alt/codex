import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ReviewSession from "@/components/ReviewSession";
import EmptyState from "@/components/EmptyState";

export default function ReviewPage() {
  const { dueCards, subcategories, srSettings, reviewSection, logError, setView } = useAppContext();

  return (
    <ErrorBoundary label="Ponavljanje" onNavigateHome={() => setView("dashboard")}>
      {dueCards.length === 0 ? (
        <EmptyState type="review" />
      ) : (
        <ReviewSession
          dueCards={dueCards}
          subcategories={subcategories}
          srSettings={srSettings}
          onReviewSection={reviewSection}
          onLogError={logError}
          onBack={() => setView("dashboard")}
        />
      )}
    </ErrorBoundary>
  );
}
