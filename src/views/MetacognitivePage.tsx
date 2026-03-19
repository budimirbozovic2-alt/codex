import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MetacognitiveCenter from "@/components/MetacognitiveCenter";

export default function MetacognitivePage() {
  const { cards, categories, reviewLog, srSettings, setView, handleSendToWorkshop } = useAppContext();

  return (
    <ErrorBoundary label="Metakognicija" onNavigateHome={() => setView("dashboard")}>
      <MetacognitiveCenter
        cards={cards}
        categories={categories}
        reviewLog={reviewLog}
        onBack={() => setView("stats")}
        settings={srSettings}
        onSendToWorkshop={handleSendToWorkshop}
      />
    </ErrorBoundary>
  );
}
