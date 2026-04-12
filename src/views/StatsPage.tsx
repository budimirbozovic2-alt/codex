import { HelpCircle } from "lucide-react";
import { useState, lazy, Suspense } from "react";
import { useCardData, useCategoryData, useReviewData, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MyStats from "@/components/MyStats";
import { AnimatePresence } from "framer-motion";

const StatsOnboarding = lazy(() => import("@/components/StatsOnboarding"));

export default function StatsPage() {
  const { cards, ready } = useCardData();
  const { categories, categoryRecords, subcategories, categoryStats } = useCategoryData();
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
      <div className="relative">
        <button
          onClick={() => setShowOnboarding(true)}
          className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
          title="Vodič za statistiku"
          aria-label="Vodič za statistiku"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <MyStats
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
