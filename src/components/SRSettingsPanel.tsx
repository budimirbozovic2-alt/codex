import { useState } from "react";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw } from "lucide-react";

interface Props {
  settings: SRSettings;
  onUpdate: (settings: SRSettings) => void;
  onBack: () => void;
}

const FIELD_CONFIG = [
  { key: "initialInterval" as const, label: "Početni interval (dana)", description: "Interval nakon prvog uspješnog ponavljanja", min: 0.5, max: 7, step: 0.5 },
  { key: "secondInterval" as const, label: "Drugi interval (dana)", description: "Interval nakon drugog uspješnog ponavljanja", min: 1, max: 30, step: 1 },
  { key: "minEaseFactor" as const, label: "Minimalni faktor lakoće", description: "Najniža vrijednost ease faktora (preporučeno 1.3)", min: 1.1, max: 2.0, step: 0.1 },
  { key: "failIntervalMinutes" as const, label: "Interval pri padu (min)", description: "Vrijeme čekanja nakon prvog pada", min: 1, max: 60, step: 1 },
  { key: "failIntervalGrowth" as const, label: "Rast intervala pri padu", description: "Množilac za svaki uzastopni pad (npr. 2 = 10min → 20min → 40min)", min: 1, max: 4, step: 0.5 },
  { key: "leechThreshold" as const, label: "Prag za 'leech' upozorenje", description: "Broj padova nakon kojeg se cjelina označava kao problematična", min: 2, max: 20, step: 1 },
];

export default function SRSettingsPanel({ settings, onUpdate, onBack }: Props) {
  const [local, setLocal] = useState<SRSettings>({ ...settings });

  const handleChange = (key: keyof SRSettings, value: number) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(local);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SR_SETTINGS });
  };

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings);
  const isDefault = JSON.stringify(local) === JSON.stringify(DEFAULT_SR_SETTINGS);

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div>
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Nazad
        </button>
        <h2 className="text-3xl font-serif">Podešavanja ponavljanja</h2>
        <p className="text-muted-foreground mt-2">Prilagodite SM-2 algoritam svojim potrebama</p>
      </div>

      <div className="space-y-4">
        {FIELD_CONFIG.map(({ key, label, description, min, max, step }) => (
          <div key={key} className="rounded-xl border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{label}</label>
              <Input
                type="number"
                value={local[key]}
                onChange={(e) => handleChange(key, parseFloat(e.target.value) || min)}
                min={min}
                max={max}
                step={step}
                className="w-24 text-right bg-background"
              />
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
            {local[key] !== DEFAULT_SR_SETTINGS[key] && (
              <p className="text-xs text-primary">Podrazumijevano: {DEFAULT_SR_SETTINGS[key]}</p>
            )}
          </div>
        ))}
      </div>

      {/* How it works explanation */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-serif text-lg">Kako radi</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Ocjena 0-2 (pad):</strong> Interval se smanjuje na {local.failIntervalMinutes} min, pa {local.failIntervalMinutes * local.failIntervalGrowth} min, pa {Math.round(local.failIntervalMinutes * local.failIntervalGrowth * local.failIntervalGrowth)} min...</p>
          <p><strong className="text-foreground">Ocjena 3+ (uspjeh):</strong> Prvi put → {local.initialInterval}d, drugi → {local.secondInterval}d, zatim interval × ease faktor</p>
          <p><strong className="text-foreground">Leech:</strong> Nakon {local.leechThreshold} padova, cjelina se označava kao problematična</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={!hasChanges} className="flex-1">
          Sačuvaj izmjene
        </Button>
        <Button onClick={handleReset} variant="outline" disabled={isDefault}>
          <RotateCcw className="h-4 w-4 mr-2" /> Podrazumijevano
        </Button>
      </div>
    </div>
  );
}
