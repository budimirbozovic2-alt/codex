import { ArrowLeft } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import AlgorithmTab from "@/components/settings/AlgorithmTab";
import SettingsFormFooter from "@/components/settings/SettingsFormFooter";
import SettingsSectionLayout from "@/components/settings/SettingsSectionLayout";
import { useSettingsContext } from "@/components/settings/SettingsProvider";

export default function SettingsLearningView() {
  const {
    subjectId,
    subjectName,
    isSubjectMode,
    overridesEnabled,
    setOverridesEnabled,
    local,
    setLocal,
    app,
    setApp,
  } = useSettingsContext();

  if (isSubjectMode && subjectId) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={`/subject/${subjectId}`}
            className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Nazad na predmet"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h2 className="text-display text-2xl text-foreground truncate">Podešavanja — {subjectName}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Algoritam prilagođen ovom predmetu</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Prilagođena podešavanja</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {overridesEnabled
                ? "Ovaj predmet koristi svoja podešavanja algoritma."
                : "Ovaj predmet koristi globalna podešavanja. Uključi za prilagodbu."}
            </p>
          </div>
          <Switch checked={overridesEnabled} onCheckedChange={setOverridesEnabled} />
        </div>

        <div
          className={`transition-opacity duration-200 ${
            overridesEnabled ? "opacity-100" : "opacity-40 pointer-events-none"
          }`}
        >
          <AlgorithmTab local={local} setLocal={setLocal} app={app} setApp={setApp} />
        </div>

        <SettingsFormFooter />
        <div className="pb-8" />
      </div>
    );
  }

  if (isSubjectMode) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <SettingsSectionLayout
      title="Učenje i memorija"
      description="FSRS, ciljna retencija, dnevni cilj i kognitivni otpor"
    >
      <AlgorithmTab local={local} setLocal={setLocal} app={app} setApp={setApp} />
    </SettingsSectionLayout>
  );
}
