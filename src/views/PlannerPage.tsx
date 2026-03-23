import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import StrategicPlanner from "@/components/StrategicPlanner";
import { useCallback } from "react";

export default function PlannerPage() {
  const { cards, categories, reviewLog, setView } = useAppContext();

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
        onBack={() => setView("dashboard")}
        onNavigateToDatabase={handleNavigateToDatabase}
      />
    </ErrorBoundary>
  );
}
