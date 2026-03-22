import { useState, lazy, Suspense } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/components/Dashboard";
import EmptyState from "@/components/EmptyState";
import { default as HelpCircle } from "lucide-react/dist/esm/icons/help-circle";
import { AnimatePresence } from "framer-motion";

const DashboardOnboarding = lazy(() => import("@/components/DashboardOnboarding"));

export default function DashboardPage() {
  const { cards, stats, categoryStats, categories, subcategories, reviewLog, srSettings, setView } = useAppContext();
  const [showOnboarding, setShowOnboarding] = useState(false);

  return (
    <ErrorBoundary label="Dashboard" onNavigateHome={() => setView("dashboard")}>
      {cards.length === 0 ? (
        <EmptyState type="dashboard" onAction={() => setView("create")} />
      ) : (
        <div className="relative">
          <button
            onClick={() => setShowOnboarding(true)}
            className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
            title="Vodič za kontrolnu tablu"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
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
