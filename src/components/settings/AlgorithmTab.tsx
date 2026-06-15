import { SRSettings } from "@/lib/spaced-repetition";
import { AppSettings } from "@/lib/app-settings";
import { Slider } from "@/components/ui/slider";
import { NumberStepper } from "@/components/ui/number-stepper";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsRow, SettingsRowWide } from "@/components/settings/SettingsRow";

interface Props {
  local: SRSettings;
  setLocal: React.Dispatch<React.SetStateAction<SRSettings>>;
  app: AppSettings;
  setApp: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export default function AlgorithmTab({ local, setLocal, app, setApp }: Props) {
  const handleChange = (key: keyof SRSettings, value: number) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-8">
      <SettingsSection title="Ciljna retencija">
        <SettingsRowWide label="Stopa zadržavanja">
          <div className="space-y-1.5">
            <div className="flex justify-end">
              <span className="text-sm font-medium tabular-nums">
                {Math.round(app.targetRetention * 100)}%
              </span>
            </div>
            <Slider
              value={[app.targetRetention * 100]}
              min={85}
              max={99}
              step={1}
              onValueChange={(v) =>
                setApp((prev) => ({ ...prev, targetRetention: v[0] / 100 }))
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>85% — brže</span>
              <span>99% — sigurnije</span>
            </div>
            {app.targetRetention !== 0.95 && (
              <p className="text-xs text-primary">Promijenjeno sa podrazumijevanih 95%.</p>
            )}
          </div>
        </SettingsRowWide>
      </SettingsSection>

      <SettingsSection title="Ponavljanje (FSRS)">
        <SettingsRow
          label="Leech prag"
          hint="Padovi za oznaku problematične cjeline"
        >
          <NumberStepper
            value={local.leechThreshold}
            onChange={(v) => handleChange("leechThreshold", v)}
            min={2}
            max={20}
            step={1}
          />
        </SettingsRow>
        <SettingsRow label="Dnevni cilj" hint="Ponavljanja dnevno">
          <NumberStepper
            value={local.dailyGoal}
            onChange={(v) => handleChange("dailyGoal", v)}
            min={5}
            max={100}
            step={5}
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Kognitivni otpor"
        description="Koliko svaki faktor utiče na ukupni skor. Normalizuje se automatski."
      >
        {([
          { key: "lapses" as const, label: "Lapsusi", icon: "❌" },
          { key: "latency" as const, label: "Latencija", icon: "⏱️" },
          { key: "forgetting" as const, label: "Zaboravljanje", icon: "📉" },
        ]).map(({ key, label, icon }) => {
          const w = local.resistanceWeights ?? { lapses: 40, latency: 30, forgetting: 30 };
          const total = w.lapses + w.latency + w.forgetting;
          const pct = total > 0 ? Math.round((w[key] / total) * 100) : 33;
          return (
            <SettingsRowWide key={key} label={`${icon} ${label}`}>
              <div className="space-y-1.5">
                <div className="flex justify-end">
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {w[key]} ({pct}%)
                  </span>
                </div>
                <Slider
                  value={[w[key]]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) =>
                    setLocal((prev) => ({
                      ...prev,
                      resistanceWeights: {
                        ...(prev.resistanceWeights ?? {
                          lapses: 40,
                          latency: 30,
                          forgetting: 30,
                        }),
                        [key]: v[0],
                      },
                    }))
                  }
                />
              </div>
            </SettingsRowWide>
          );
        })}
      </SettingsSection>
    </div>
  );
}
