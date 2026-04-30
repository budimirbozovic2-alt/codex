import { useState, lazy, Suspense } from "react";
import { useCardData, useCategoryData, useCategoryStatsData, useReviewData, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MyStats from "@/components/MyStats";
import { AnimatePresence } from "framer-motion";

const StatsOnboarding = lazy(() => import("@/components/StatsOnboarding"));

export default function StatsPage() {
  const { cards, ready } = useCardData();
  const { categories, categoryRecords, subcategories } = useCategoryData();
  const { categoryStats } = useCategoryStatsData();
  const { reviewLog, srSettings } = useReviewData();
  const { setView } = useUIContext();
  const [showOnboarding, setShowOnboarding] = useState(false);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje statistike...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Statistike" onNavigateHome={() => setView("dashboard")}>
      <div>
        <MyStats
          onShowOnboarding={() => setShowOnboarding(true)}
          cards={cards}
          categories={categories}
          categoryRecords={categoryRecords}
          subcategories={subcategories}
          categoryStats={categoryStats}
          reviewLog={reviewLog}
          srSettings={srSettings}
          onShowPlanner={() => setView("planner")}
        />
      </div>
      <AnimatePresence>
        {showOnboarding && (
          <Suspense fallback={null}>
            <StatsOnboarding onComplete={() => setShowOnboarding(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
}
