import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MetacognitiveCenter from "@/components/MetacognitiveCenter";

export default function MetacognitivePage() {
  const { cards, categories, reviewLog, srSettings, clearErrorLog } = useCardContext();
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Metakognicija" onNavigateHome={() => setView("dashboard")}>
      <MetacognitiveCenter
        cards={cards}
        categories={categories}
        reviewLog={reviewLog}
        onBack={() => setView("stats")}
        settings={srSettings}
        onClearErrorLog={clearErrorLog}
      />
    </ErrorBoundary>
  );
}
