import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardData, useReviewData } from "@/hooks/cards/useCardState";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataReadyGate, DashboardSkeleton } from "@/components/ui/loading";
import StrategicPlanner from "@/components/StrategicPlanner";

export default function PlannerPage() {
  const { cards, ready } = useCardData();
  const { categories, categoryRecords } = useCategoryData();
  const { reviewLog } = useReviewData();

  return (
    <DataReadyGate ready={ready} skeleton={<DashboardSkeleton />}>
      <div className="space-y-8 animate-fade-in">
        <ErrorBoundary label="Planner">
          <StrategicPlanner
            cards={cards}
            categories={categories}
            categoryRecords={categoryRecords}
            reviewLog={reviewLog}
          />
        </ErrorBoundary>
      </div>
    </DataReadyGate>
  );
}
