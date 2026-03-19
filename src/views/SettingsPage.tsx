import { useAppContext } from "@/contexts/AppContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SRSettingsPanel from "@/components/SRSettingsPanel";

export default function SettingsPage() {
  const { srSettings, updateSRSettings, setView } = useAppContext();

  return (
    <ErrorBoundary label="Podešavanja" onNavigateHome={() => setView("dashboard")}>
      <SRSettingsPanel
        settings={srSettings}
        onUpdate={updateSRSettings}
        onBack={() => setView("dashboard")}
        onOpenMajorSystem={() => setView("major-system-settings")}
      />
    </ErrorBoundary>
  );
}
