import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MnemonicModule from "@/components/MnemonicModule";

export default function MnemonicPage() {
  const { setView } = useAppContext();

  return (
    <ErrorBoundary label="Memo radionica" onNavigateHome={() => setView("dashboard")}>
      <MnemonicModule onBack={() => setView("dashboard")} />
    </ErrorBoundary>
  );
}
