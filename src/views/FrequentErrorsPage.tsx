import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FrequentErrors from "@/pages/FrequentErrors";

export default function FrequentErrorsPage() {
  const { cards, clearErrorLog } = useCardContext();
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Česte greške" onNavigateHome={() => setView("dashboard")}>
      <FrequentErrors cards={cards} onBack={() => setView("dashboard")} onClearErrorLog={clearErrorLog} />
    </ErrorBoundary>
  );
}
