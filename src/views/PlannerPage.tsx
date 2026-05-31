import { lazy, Suspense } from "react";
import { useCardData, useCategoryData, useReviewData } from "@/contexts/AppContext";
import { PageSkeleton } from "@/components/ui/page-skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const StrategicPlanner = lazy(() => import("@/components/StrategicPlanner"));

export default function PlannerPage() {
  const { cards } = useCardData();
  const { categories, categoryRecords } = useCategoryData();
  const { reviewLog } = useReviewData();

  return (
    <div className="p-4 max-w-7xl mx-auto w-full">
      <Suspense fallback={<PageSkeleton />}>
        <ErrorBoundary label="Planner">
          <StrategicPlanner
            cards={cards}
            categories={categories}
            categoryRecords={categoryRecords}
            reviewLog={reviewLog}
          />
        </ErrorBoundary>
      </Suspense>
    </div>
  );
}
