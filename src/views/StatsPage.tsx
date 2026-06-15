import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardData, useCategoryStatsData, useReviewData } from "@/hooks/cards/useCardState";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DataReadyGate, DashboardSkeleton } from "@/components/ui/loading";
import MyStats from "@/components/MyStats";

export default function StatsPage() {
  const { cards, ready } = useCardData();
  const { categories, categoryRecords, subcategories } = useCategoryData();
  const { categoryStats } = useCategoryStatsData();
  const { reviewLog, srSettings } = useReviewData();

  return (
    <DataReadyGate ready={ready} skeleton={<DashboardSkeleton />}>
      <div className="space-y-8 animate-fade-in">
        <ErrorBoundary label="Stats">
          <MyStats
            cards={cards}
            categories={categories}
            categoryRecords={categoryRecords}
            subcategories={subcategories}
            categoryStats={categoryStats}
            reviewLog={reviewLog}
            srSettings={srSettings}
          />
        </ErrorBoundary>
      </div>
    </DataReadyGate>
  );
}
