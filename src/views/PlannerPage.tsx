import { useState, useCallback, lazy, Suspense } from "react";
import { useCardData, useCategoryData, useReviewData, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import StrategicPlanner from "@/components/StrategicPlanner";
import { AnimatePresence } from "framer-motion";

const PlannerOnboarding = lazy(() => import("@/components/PlannerOnboarding"));

export default function PlannerPage() {
  const { cards, ready } = useCardData();
  const { categories, categoryRecords } = useCategoryData();
  const { reviewLog } = useReviewData();
  const { setView } = useUIContext();
  const [showOnboarding, setShowOnboarding] = useState(false);

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
      <div>
        <StrategicPlanner
          onShowOnboarding={() => setShowOnboarding(true)}
          cards={cards}
          categories={categories}
          categoryRecords={categoryRecords}
          reviewLog={reviewLog}
          onNavigateToDatabase={handleNavigateToDatabase}
        />
      </div>
      <AnimatePresence>
        {showOnboarding && (
          <Suspense fallback={null}>
            <PlannerOnboarding onComplete={() => setShowOnboarding(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
}
