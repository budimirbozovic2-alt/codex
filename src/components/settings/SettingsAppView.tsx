import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import PersonalizationTab from "@/components/settings/PersonalizationTab";
import WorkflowTab from "@/components/settings/WorkflowTab";
import SettingsSectionLayout from "@/components/settings/SettingsSectionLayout";
import { useSettingsContext } from "@/components/settings/SettingsProvider";

export default function SettingsAppView() {
  const { isSubjectMode, app, setApp, tts, setTts, voices } = useSettingsContext();
  const location = useLocation();

  if (isSubjectMode) {
    return <Navigate to={`/settings/learning${location.search}`} replace />;
  }

  return (
    <Routes>
      <Route index element={<Navigate to="personalization" replace />} />
      <Route
        path="personalization"
        element={(
          <SettingsSectionLayout
            title="Personalizacija"
            description="Jezik, tema, widgeti početne table i zvuk"
            showFooter={false}
          >
            <PersonalizationTab app={app} setApp={setApp} />
          </SettingsSectionLayout>
        )}
      />
      <Route
        path="workflow"
        element={(
          <SettingsSectionLayout
            title="Workflow"
            description="Pomodoro, glasovni čitač i podsjetnici"
            showFooter={false}
          >
            <WorkflowTab
              app={app}
              setApp={setApp}
              tts={tts}
              setTts={setTts}
              voices={voices}
            />
          </SettingsSectionLayout>
        )}
      />
      <Route path="*" element={<Navigate to="personalization" replace />} />
    </Routes>
  );
}
