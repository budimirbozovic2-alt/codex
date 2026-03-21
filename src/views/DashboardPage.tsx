import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/components/Dashboard";
import EmptyState from "@/components/EmptyState";

export default function DashboardPage() {
  const { cards, stats, categoryStats, categories, subcategories, reviewLog, srSettings, setView } = useAppContext();

  return (
    <ErrorBoundary label="Dashboard" onNavigateHome={() => setView("dashboard")}>
      {cards.length === 0 ? (
        <EmptyState type="dashboard" onAction={() => setView("create")} />
      ) : (
        <Dashboard
          stats={stats}
          categoryStats={categoryStats}
          categories={categories}
          subcategories={subcategories}
          cards={cards}
          reviewLog={reviewLog}
          srSettings={srSettings}
          onExport={() => {}}
        />
      )}
    </ErrorBoundary>
  );
}
