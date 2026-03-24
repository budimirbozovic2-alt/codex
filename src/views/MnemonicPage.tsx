import { useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MnemonicModule from "@/components/MnemonicModule";

export default function MnemonicPage() {
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Memo radionica" onNavigateHome={() => setView("dashboard")}>
      <MnemonicModule onBack={() => setView("dashboard")} />
    </ErrorBoundary>
  );
}
