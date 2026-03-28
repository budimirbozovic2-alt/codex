import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MyStats from "@/components/MyStats";

export default function StatsPage() {
  const { cards, categories, subcategories, categoryStats, reviewLog, srSettings } = useCardContext();
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Statistike" onNavigateHome={() => setView("dashboard")}>
      <MyStats
        cards={cards}
        categories={categories}
        subcategories={subcategories}
        categoryStats={categoryStats}
        reviewLog={reviewLog}
        srSettings={srSettings}
        onShowKnowledgeMap={() => setView("knowledge-map")}
        onShowPlanner={() => setView("planner")}
      />
    </ErrorBoundary>
  );
}
