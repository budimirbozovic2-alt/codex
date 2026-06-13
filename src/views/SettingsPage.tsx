import { Routes, Route, Navigate } from "react-router-dom";
import { useReviewData, useSettingsActions } from "@/hooks/cards/useCardState";
import { useUIContext } from "@/hooks/useUI";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { SettingsProvider } from "@/components/settings/SettingsProvider";
import SettingsLegacyRedirect from "@/components/settings/SettingsLegacyRedirect";
import SettingsHub from "@/components/settings/SettingsHub";
import SettingsLearningView from "@/components/settings/SettingsLearningView";
import SettingsAppView from "@/components/settings/SettingsAppView";
import SettingsDataView from "@/components/settings/SettingsDataView";

export default function SettingsPage() {
  const { srSettings } = useReviewData();
  const { updateSRSettings } = useSettingsActions();
  const { setView } = useUIContext();

  return (
    <ErrorBoundary label="Podešavanja" onNavigateHome={() => setView("dashboard")}>
      <SettingsProvider settings={srSettings} onUpdate={updateSRSettings}>
        <SettingsLegacyRedirect />
        <Routes>
          <Route index element={<SettingsHub />} />
          <Route path="learning" element={<SettingsLearningView />} />
          <Route path="app/*" element={<SettingsAppView />} />
          <Route path="data" element={<SettingsDataView />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
