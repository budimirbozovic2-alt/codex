import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import StrategicPlanner from "@/components/StrategicPlanner";

export default function PlannerPage() {
  const { cards, categories, reviewLog, setView } = useAppContext();

  return (
    <ErrorBoundary label="Planer" onNavigateHome={() => setView("dashboard")}>
      <StrategicPlanner cards={cards} categories={categories} reviewLog={reviewLog} onBack={() => setView("dashboard")} />
    </ErrorBoundary>
  );
}
