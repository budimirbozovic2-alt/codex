import { useState, lazy, Suspense } from "react";
import { useCardData, useCategoryData, useReviewData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MetacognitiveCenter from "@/components/MetacognitiveCenter";
import { AnimatePresence } from "framer-motion";

const MetacognitiveOnboarding = lazy(() => import("@/components/MetacognitiveOnboarding"));

export default function MetacognitivePage() {
  const { cards, ready } = useCardData();
  const { categories, categoryRecords } = useCategoryData();
  const { reviewLog, srSettings } = useReviewData();
  const { clearErrorLog } = useCardActions();
  const { setView } = useUIContext();
  const [showOnboarding, setShowOnboarding] = useState(false);

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje analitike...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Metakognicija" onNavigateHome={() => setView("dashboard")}>
      <div>
        <MetacognitiveCenter
          onShowOnboarding={() => setShowOnboarding(true)}
          cards={cards}
          categories={categories}
          categoryRecords={categoryRecords}
          reviewLog={reviewLog}
          settings={srSettings}
          onClearErrorLog={clearErrorLog}
        />
      </div>
      <AnimatePresence>
        {showOnboarding && (
          <Suspense fallback={null}>
            <MetacognitiveOnboarding onComplete={() => setShowOnboarding(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </ErrorBoundary>
  );
}
