import { useReviewData, useSettingsActions } from "@/hooks/cards/useCardState";
import { useUIContext } from "@/hooks/useUI";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import SRSettingsPanel from "@/components/SRSettingsPanel";

export default function SettingsPage() {
  const { srSettings } = useReviewData();
  const { updateSRSettings } = useSettingsActions();
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Podešavanja" onNavigateHome={() => setView("dashboard")}>
      <SRSettingsPanel
        settings={srSettings}
        onUpdate={updateSRSettings}
      />
    </ErrorBoundary>
  );
}
