import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LearnSession from "@/components/LearnSession";

export default function LearnPage() {
  const { cards, categories, subcategories, markRead, reviewSection, setView, stats } = useAppContext();

  return (
    <ErrorBoundary label="Učenje" onNavigateHome={() => setView("dashboard")}>
      <LearnSession
        cards={cards}
        categories={categories}
        subcategories={subcategories}
        onMarkRead={markRead}
        onReviewSection={reviewSection}
        onBack={() => setView("dashboard")}
        dueCount={stats.due}
      />
    </ErrorBoundary>
  );
}
