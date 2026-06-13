import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import PersonalizationTab from "@/components/settings/PersonalizationTab";
import WorkflowTab from "@/components/settings/WorkflowTab";
import SettingsSectionLayout from "@/components/settings/SettingsSectionLayout";
import { useSettingsContext } from "@/components/settings/SettingsProvider";

const APP_SUBSECTIONS = [
  { path: "personalization", to: "/settings/app/personalization", label: "Personalizacija" },
  { path: "workflow", to: "/settings/app/workflow", label: "Workflow" },
] as const;

function SettingsAppSubNav() {
  const { pathname } = useLocation();

  return (
    <nav
      className="flex gap-1 p-1 rounded-lg bg-secondary/50 w-fit"
      role="tablist"
      aria-label="Podsekcije aplikacije"
    >
      {APP_SUBSECTIONS.map(({ to, label }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            role="tab"
            aria-selected={active}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SettingsAppView() {
  const { isSubjectMode, app, setApp, tts, setTts, voices } = useSettingsContext();
  const location = useLocation();

  if (isSubjectMode) {
    return <Navigate to={`/settings/learning${location.search}`} replace />;
  }

  return (
    <SettingsSectionLayout
      title="Aplikacija"
      description="Izgled, dashboard, sesija učenja i podsjetnici"
      subNav={<SettingsAppSubNav />}
      showFooter={false}
    >
      <Routes>
        <Route index element={<Navigate to="personalization" replace />} />
        <Route
          path="personalization"
          element={<PersonalizationTab app={app} setApp={setApp} />}
        />
        <Route
          path="workflow"
          element={
            <WorkflowTab
              app={app}
              setApp={setApp}
              tts={tts}
              setTts={setTts}
              voices={voices}
            />
          }
        />
        <Route path="*" element={<Navigate to="personalization" replace />} />
      </Routes>
    </SettingsSectionLayout>
  );
}
