import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import StrategicPlanner from "@/components/StrategicPlanner";
import { useCallback } from "react";

export default function PlannerPage() {
  const { cards, categories, reviewLog } = useCardContext();
  const { setView } = useUIContext();

  const handleNavigateToDatabase = useCallback((category: string) => {
    sessionStorage.setItem("sr-deeplink-category", category);
    setView("database");
  }, [setView]);

  return (
    <ErrorBoundary label="Planer" onNavigateHome={() => setView("dashboard")}>
      <StrategicPlanner
        cards={cards}
        categories={categories}
        reviewLog={reviewLog}
        onNavigateToDatabase={handleNavigateToDatabase}
      />
    </ErrorBoundary>
  );
}
