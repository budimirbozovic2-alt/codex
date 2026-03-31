import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import FrequentErrors from "@/pages/FrequentErrors";

export default function FrequentErrorsPage() {
  const { cards, categoryRecords, clearErrorLog, ready } = useCardContext();
  const { setView } = useUIContext();

  if (!ready) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Učitavanje podataka...</p>
      </div>
    );
  }

  return (
    <ErrorBoundary label="Česte greške" onNavigateHome={() => setView("dashboard")}>
      <FrequentErrors cards={cards} categoryRecords={categoryRecords} onClearErrorLog={clearErrorLog} />
    </ErrorBoundary>
  );
}
