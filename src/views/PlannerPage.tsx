import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import StrategicPlanner from "@/components/StrategicPlanner";
import { useCallback } from "react";

export default function PlannerPage() {
  const { cards, categories, categoryRecords, reviewLog, ready } = useCardContext();
  const { setView } = useUIContext();

  const handleNavigateToDatabase = useCallback((category: string) => {
    sessionStorage.setItem("sr-deeplink-category", category);
    setView("categories");
  }, [setView]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje planera...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Planer" onNavigateHome={() => setView("dashboard")}>
      <StrategicPlanner
        cards={cards}
        categories={categories}
        categoryRecords={categoryRecords}
        reviewLog={reviewLog}
        onNavigateToDatabase={handleNavigateToDatabase}
      />
    </ErrorBoundary>
  );
}
