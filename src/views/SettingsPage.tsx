import { useCardContext, useUIContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SRSettingsPanel from "@/components/SRSettingsPanel";

export default function SettingsPage() {
  const { srSettings, updateSRSettings } = useCardContext();
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Podešavanja" onNavigateHome={() => setView("dashboard")}>
      <SRSettingsPanel
        settings={srSettings}
        onUpdate={updateSRSettings}
        onBack={() => setView("dashboard")}
      />
    </ErrorBoundary>
  );
}
