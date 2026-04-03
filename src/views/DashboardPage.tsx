import { HelpCircle } from "lucide-react";
import { useState, useMemo, lazy, Suspense } from "react";
import { useCardData, useCategoryData, useReviewData, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/components/Dashboard";
import EmptyState from "@/components/EmptyState";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { AnimatePresence } from "framer-motion";
const DashboardOnboarding = lazy(() => import("@/components/DashboardOnboarding"));

export default function DashboardPage() {
  const { cards, stats, ready } = useCardData();
  const { categories, categoryRecords, subcategories, categoryStats } = useCategoryData();
  const { reviewLog, srSettings } = useReviewData();
  const { setView } = useUIContext();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const lastSourceLabel = useMemo(() => {
    const lastUsed = localStorage.getItem("sr-last-source-label");
    return lastUsed || (cards.some(c => c.sourceId) ? "Izvor" : null);
  }, [cards]);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje kontrolne table...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Dashboard" onNavigateHome={() => setView("dashboard")}>
      {cards.length === 0 ? (
        <EmptyState type="dashboard" onAction={() => setView("create")} />
      ) : (
        <div className="relative space-y-6">
          <button
            onClick={() => setShowOnboarding(true)}
            className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
            title="Vodič za kontrolnu tablu"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <QuickActions dueCount={stats.due} hasCards={cards.length > 0} lastSourceLabel={lastSourceLabel} />
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
        </div>
      )}
      <AnimatePresence>
        {showOnboarding && (
          <Suspense fallback={null}>
            <DashboardOnboarding onComplete={() => setShowOnboarding(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
}
