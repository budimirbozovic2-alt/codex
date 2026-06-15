import { AppSettings, COLOR_THEMES, applyColorTheme } from "@/lib/app-settings";
import { SUPPORTED_LOCALES, useI18n, type AppLocale } from "@/i18n";
import { playGradeGood } from "@/lib/sounds";
import { taskScheduler } from "@/lib/scheduler";
import { Switch } from "@/components/ui/switch";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsRow, SettingsRowWide } from "@/components/settings/SettingsRow";

interface Props {
  app: AppSettings;
  setApp: React.Dispatch<React.SetStateAction<AppSettings>>;
}

const LOCALE_LABEL_KEYS = {
  me: "settings.localeMe",
  en: "settings.localeEn",
} as const satisfies Record<AppLocale, import("@/i18n").TranslationKey>;

const DASHBOARD_WIDGETS = [
  { key: "showExamProgress" as const, label: "Napredak do cilja" },
  { key: "showCoreStats" as const, label: "Brojači (Za ponavljanje / Naučeno)" },
  { key: "showProgressRing" as const, label: "Progres faze (planer)" },
  { key: "showBriefing" as const, label: "Dnevni pregled" },
  { key: "showIdealFocus" as const, label: "Idealni fokus" },
  { key: "showVelocity" as const, label: "Brzina učenja" },
  { key: "showWeakCategories" as const, label: "Najslabije kategorije" },
  { key: "showHeatmap" as const, label: "Streak heatmapa" },
  { key: "showStatusIcons" as const, label: "Status ikone" },
] as const;

export default function PersonalizationTab({ app, setApp }: Props) {
  const { t, setLocale } = useI18n();

  return (
    <div className="space-y-8">
      <SettingsSection title={t("settings.language")} description={t("settings.languageHint")}>
        <SettingsRowWide label={t("settings.language")}>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LOCALES.map((locale) => {
              const isActive = app.locale === locale;
              return (
                <button
                  key={locale}
                  type="button"
                  onClick={() => {
                    setApp((prev) => ({ ...prev, locale }));
                    setLocale(locale);
                  }}
                  className={`p-3 rounded-lg border-2 transition-all text-left text-sm font-medium ${
                    isActive
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-transparent bg-secondary/40 hover:bg-secondary/70"
                  }`}
                >
                  {t(LOCALE_LABEL_KEYS[locale])}
                </button>
              );
            })}
          </div>
        </SettingsRowWide>
      </SettingsSection>

      <SettingsSection title="Izgled" description="Odaberi paletu koja ti odgovara. Primjenjuje se odmah.">
        <SettingsRowWide label="Tema boja">
          <div className="grid grid-cols-3 gap-2">
            {COLOR_THEMES.map((theme) => {
              const isActive = app.colorTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    setApp((prev) => ({ ...prev, colorTheme: theme.id }));
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
        </SettingsRowWide>
      </SettingsSection>

      <SettingsSection title="Početna tabla" description="Odaberi koje widgete želiš vidjeti.">
        {DASHBOARD_WIDGETS.map(({ key, label }) => (
          <SettingsRow key={key} label={label}>
            <Switch
              checked={app.dashboardWidgets[key]}
              onCheckedChange={(v) =>
                setApp((prev) => ({
                  ...prev,
                  dashboardWidgets: { ...prev.dashboardWidgets, [key]: v },
                }))
              }
            />
          </SettingsRow>
        ))}
      </SettingsSection>

      <SettingsSection title="Zvuk">
        <SettingsRow
          label="Zvučni efekti"
          hint="Tonovi pri ocjenjivanju i završetku sesije"
        >
          <Switch
            checked={app.soundEffects}
            onCheckedChange={(v) => {
              setApp((prev) => ({ ...prev, soundEffects: v }));
              if (v) {
                taskScheduler.setTimeout(() => playGradeGood(), 100, {
                  label: "PersonalizationTab:soundPreview",
                });
              }
            }}
          />
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
