import { HelpCircle } from "lucide-react";
import { useState, lazy, Suspense } from "react";
import { useCategoryData } from "@/hooks/cards/useCategoryState";
import { useCardData, useCategoryStatsData, useReviewData } from "@/hooks/cards/useCardState";
import { useBackupActions } from "@/hooks/cards/useActions";
import { useUIContext } from "@/hooks/useUI";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/components/Dashboard";
import EmptyState from "@/components/EmptyState";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { ToolCards } from "@/components/dashboard/ToolCards";
import { PageHeader } from "@/components/ui/PageHeader";
import InfoPanel from "@/components/InfoPanel";
import { AnimatePresence } from "@/lib/motion";
import { DataReadyGate, DashboardSkeleton } from "@/components/ui/loading";
const OnboardingModal = lazy(() => import("@/components/OnboardingModal"));

export default function DashboardPage() {
  const { cards, stats, ready } = useCardData();
  const { categories, categoryRecords, subcategories } = useCategoryData();
  const { categoryStats } = useCategoryStatsData();
  const { reviewLog, srSettings } = useReviewData();
  const { exportData } = useBackupActions();
  const { setView } = useUIContext();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const headerActions = (
    <>
      <InfoPanel title="Prečice — Kontrolna tabla">
        <p>Tastaturne prečice dostupne na kontrolnoj tabli:</p>
        <div className="space-y-1 mt-1.5">
          <div className="flex items-center justify-between"><span>Novo pitanje</span><kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground border">N</kbd></div>
        </div>
      </InfoPanel>
      <button
        onClick={() => setShowOnboarding(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
        title="Vodič za kontrolnu tablu"
        aria-label="Vodič za kontrolnu tablu"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Vodič</span>
      </button>
    </>
  );

  return (
    <DataReadyGate ready={ready} skeleton={<DashboardSkeleton />}>
      <ErrorBoundary label="Dashboard" onNavigateHome={() => setView("dashboard")}>
        {cards.length === 0 ? (
          <div className="space-y-6">
            <PageHeader eyebrow="Pregled" title="Početna tabla" actions={headerActions} />
            <EmptyState type="dashboard" onAction={() => setShowOnboarding(true)} />
            <QuickActions dueCount={0} hasCards={false} />
            <ToolCards />
          </div>
        ) : (
          <Dashboard
            stats={stats}
            categoryStats={categoryStats}
            categories={categories}
            categoryRecords={categoryRecords}
            subcategories={subcategories}
            cards={cards}
            reviewLog={reviewLog}
            srSettings={srSettings}
            onExport={() => void exportData()}
            headerActions={headerActions}
          />
        )}
        <AnimatePresence>
          {showOnboarding && (
            <Suspense fallback={null}>
              <OnboardingModal preset="dashboard" onComplete={() => setShowOnboarding(false)} />
            </Suspense>
          )}
        </AnimatePresence>
      </ErrorBoundary>
    </DataReadyGate>
  );
}
