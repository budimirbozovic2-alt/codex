import { HelpCircle } from "lucide-react";
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
      <div className="relative">
        <button
          onClick={() => setShowOnboarding(true)}
          className="absolute top-0 right-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors z-10"
          title="Vodič za dnevnik"
          aria-label="Vodič za dnevnik"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
        <MetacognitiveCenter
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
