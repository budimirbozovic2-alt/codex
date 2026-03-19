import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FrequentErrors from "@/pages/FrequentErrors";

export default function FrequentErrorsPage() {
  const { cards, setView, clearErrorLog } = useAppContext();

  return (
    <ErrorBoundary label="Česte greške" onNavigateHome={() => setView("dashboard")}>
      <FrequentErrors cards={cards} onBack={() => setView("dashboard")} onClearErrorLog={clearErrorLog} />
    </ErrorBoundary>
  );
}
