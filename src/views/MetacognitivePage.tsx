import { useCardData, useCategoryData, useReviewData, useCardActions, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MetacognitiveCenter from "@/components/MetacognitiveCenter";

export default function MetacognitivePage() {
  const { cards, categories, categoryRecords, reviewLog, srSettings, clearErrorLog, ready } = useCardContext();
  const { setView } = useUIContext();

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
      <MetacognitiveCenter
        cards={cards}
        categories={categories}
        categoryRecords={categoryRecords}
        reviewLog={reviewLog}
        settings={srSettings}
        onClearErrorLog={clearErrorLog}
      />
    </ErrorBoundary>
  );
}
