import { lazy, Suspense } from "react";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardData, useCategoryStatsData, useReviewData } from "@/hooks/cards/useCardState";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const MyStats = lazy(() => import("@/components/MyStats"));

export default function StatsPage() {
  const { cards } = useCardData();
  const { categories, categoryRecords, subcategories } = useCategoryData();
  const { categoryStats } = useCategoryStatsData();
  const { reviewLog, srSettings } = useReviewData();

  return (
    <div className="p-4 max-w-7xl mx-auto w-full">
      <Suspense fallback={<PageSkeleton />}>
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
      </Suspense>
    </div>
  );
}
