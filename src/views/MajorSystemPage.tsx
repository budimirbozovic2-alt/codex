import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import MajorSystemSettings from "@/components/MajorSystemSettings";

export default function MajorSystemPage() {
  const { setView } = useAppContext();

  return (
    <ErrorBoundary label="Major System" onNavigateHome={() => setView("dashboard")}>
      <MajorSystemSettings onBack={() => setView("settings")} />
    </ErrorBoundary>
  );
}
