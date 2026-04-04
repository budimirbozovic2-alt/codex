import { SRSettings } from "@/lib/spaced-repetition";
import { AppSettings } from "@/lib/app-settings";
import { Slider } from "@/components/ui/slider";
import { NumberStepper } from "@/components/ui/number-stepper";

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
    <div className="space-y-5">
      {/* Ciljna retencija */}
      <div className="glass-card rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold">Ciljna retencija</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Stopa zadržavanja</span>
          <span className="text-sm font-medium tabular-nums">{Math.round(app.targetRetention * 100)}%</span>
        </div>
        <Slider
          value={[app.targetRetention * 100]}
          min={85} max={99} step={1}
          onValueChange={(v) => setApp(prev => ({ ...prev, targetRetention: v[0] / 100 }))}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>85% — brže</span>
          <span>99% — sigurnije</span>
        </div>
        {app.targetRetention !== 0.95 && (
          <p className="text-xs text-primary">Promijenjeno sa podrazumijevanih 95%.</p>
        )}
      </div>

      {/* Ponavljanje */}
      <div className="glass-card rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold">Ponavljanje (FSRS)</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm">Leech prag</label>
              <p className="text-xs text-muted-foreground">Padovi za oznaku problematične cjeline</p>
            </div>
            <NumberStepper value={local.leechThreshold} onChange={(v) => handleChange("leechThreshold", v)} min={2} max={20} step={1} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm">Dnevni cilj</label>
              <p className="text-xs text-muted-foreground">Ponavljanja dnevno</p>
            </div>
            <NumberStepper value={local.dailyGoal} onChange={(v) => handleChange("dailyGoal", v)} min={5} max={100} step={5} />
          </div>
        </div>
      </div>

      {/* Kognitivni otpor */}
      <div className="glass-card rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold">Težine kognitivnog otpora</h3>
        <p className="text-xs text-muted-foreground">Koliko svaki faktor utiče na ukupni skor. Normalizuje se automatski.</p>
        {([
          { key: "lapses" as const, label: "Lapsusi", icon: "❌" },
          { key: "latency" as const, label: "Latencija", icon: "⏱️" },
          { key: "forgetting" as const, label: "Zaboravljanje", icon: "📉" },
        ]).map(({ key, label, icon }) => {
          const w = local.resistanceWeights ?? { lapses: 40, latency: 30, forgetting: 30 };
          const total = w.lapses + w.latency + w.forgetting;
          const pct = total > 0 ? Math.round((w[key] / total) * 100) : 33;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm">{icon} {label}</label>
                <span className="text-xs text-muted-foreground tabular-nums">{w[key]} ({pct}%)</span>
              </div>
              <Slider value={[w[key]]} min={0} max={100} step={5}
                onValueChange={(v) => setLocal(prev => ({
                  ...prev,
                  resistanceWeights: { ...(prev.resistanceWeights ?? { lapses: 40, latency: 30, forgetting: 30 }), [key]: v[0] }
                }))}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
