import { HelpCircle } from "lucide-react";
import { useState, lazy, Suspense } from "react";
import { useCardData, useCategoryData, useReviewData, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/components/Dashboard";
import EmptyState from "@/components/EmptyState";

import InfoPanel from "@/components/InfoPanel";
import { AnimatePresence } from "framer-motion";
const DashboardOnboarding = lazy(() => import("@/components/DashboardOnboarding"));

export default function DashboardPage() {
  const { cards, stats, ready } = useCardData();
  const { categories, categoryRecords, subcategories, categoryStats } = useCategoryData();
  const { reviewLog, srSettings } = useReviewData();
  const { setView } = useUIContext();
  const [showOnboarding, setShowOnboarding] = useState(false);



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
          <div className="absolute top-0 right-0 flex items-center gap-1 z-10">
            <InfoPanel title="Prečice — Kontrolna tabla">
              <p>Tastaturne prečice dostupne na kontrolnoj tabli:</p>
              <div className="space-y-1 mt-1.5">
                <div className="flex items-center justify-between"><span>Novo pitanje</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">N</kbd></div>
                <div className="flex items-center justify-between"><span>Konsolidacija</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">R</kbd></div>
                <div className="flex items-center justify-between"><span>Učenje</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">L</kbd></div>
              </div>
            </InfoPanel>
            <button
              onClick={() => setShowOnboarding(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
              title="Vodič za kontrolnu tablu"
              aria-label="Vodič za kontrolnu tablu"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Onboarding</span>
            </button>
          </div>
          
          <Dashboard
            stats={stats}
            categoryStats={categoryStats}
            categories={categories}
            categoryRecords={categoryRecords}
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
