import { AppSettings, COLOR_THEMES, applyColorTheme } from "@/lib/app-settings";
import { saveAppSettings } from "@/lib/app-settings";
import { playGradeGood } from "@/lib/sounds";
import { taskScheduler } from "@/lib/scheduler";
import { Switch } from "@/components/ui/switch";

interface Props {
  app: AppSettings;
  setApp: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export default function PersonalizationTab({ app, setApp }: Props) {
  return (
    <div className="space-y-5">
      {/* Color theme picker */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">Tema boja</h3>
        <p className="text-xs text-muted-foreground">Odaberi paletu koja ti odgovara. Primjenjuje se odmah.</p>
        <div className="grid grid-cols-3 gap-2">
          {COLOR_THEMES.map((theme) => {
            const isActive = app.colorTheme === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => {
                  setApp(prev => ({ ...prev, colorTheme: theme.id }));
                  applyColorTheme(theme.id);
                }}
                className={`flex items-center gap-2.5 p-3 rounded-lg border-2 transition-all text-left ${
                  isActive
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-transparent bg-secondary/40 hover:bg-secondary/70"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex-shrink-0 ring-2 ring-offset-2 ring-offset-card ${isActive ? "ring-current" : "ring-transparent"}`}
                  style={{ backgroundColor: theme.preview, color: theme.preview }}
                />
                <span className="text-xs font-medium">{theme.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dashboard widgeti */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">Dashboard widgeti</h3>
        <p className="text-xs text-muted-foreground">Odaberi koje widgete želiš vidjeti.</p>
        {([
          { key: "showExamProgress" as const, label: "Napredak do cilja" },
          { key: "showCoreStats" as const, label: "Brojači (Due / Naučeno)" },
          { key: "showBriefing" as const, label: "Dnevni briefing" },
          { key: "showIdealFocus" as const, label: "Idealni fokus" },
          { key: "showVelocity" as const, label: "Brzina učenja" },
          { key: "showWeakCategories" as const, label: "Najslabije kategorije" },
          { key: "showHeatmap" as const, label: "Streak heatmapa" },
          { key: "showStatusIcons" as const, label: "Status ikone" },
        ]).map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between py-1">
            <label className="text-sm">{label}</label>
            <Switch checked={app.dashboardWidgets[key]}
              onCheckedChange={(v) => setApp(prev => ({
                ...prev,
                dashboardWidgets: { ...prev.dashboardWidgets, [key]: v }
              }))}
            />
          </div>
        ))}
      </div>

      {/* Zvučni efekti */}
      <div className="glass-card rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold">Zvučni efekti</h3>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm">Zvučni efekti</label>
            <p className="text-xs text-muted-foreground">Tonovi pri ocjenjivanju i završetku sesije</p>
          </div>
          <Switch checked={app.soundEffects}
            onCheckedChange={(v) => {
              setApp(prev => ({ ...prev, soundEffects: v }));
              if (v) {
                saveAppSettings({ ...app, soundEffects: true });
                taskScheduler.setTimeout(() => playGradeGood(), 100, { label: "PersonalizationTab:soundPreview" });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
