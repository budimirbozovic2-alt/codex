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
  { key: "leechThreshold" as const, label: "Prag za 'leech' upozorenje", description: "Broj padova nakon kojeg se cjelina označava kao problematična", min: 2, max: 20, step: 1 },
  { key: "dailyGoal" as const, label: "Dnevni cilj ponavljanja", description: "Broj ponavljanja koji želite završiti svaki dan", min: 5, max: 100, step: 5 },
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
        <p className="text-muted-foreground mt-2">Prilagodite FSRS algoritam svojim potrebama</p>
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

      {/* How FSRS works */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <h3 className="font-serif text-lg">Kako FSRS radi</h3>
        <div className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Opet (1):</strong> Stabilnost pada na 10%. Težina se povećava za 2.</p>
          <p><strong className="text-foreground">Teško (2):</strong> Stabilnost × 1.5 + 0.5 dana. Težina +1.</p>
          <p><strong className="text-foreground">Dobro (3):</strong> Stabilnost × 3.0 + 1.0 dana. Težina ostaje ista.</p>
          <p><strong className="text-foreground">Lako (4):</strong> Stabilnost × 5.0 + 2.0 dana. Težina -1.</p>
          <p className="pt-2"><strong className="text-foreground">Interval:</strong> Računa se za 95% stopu zadržavanja znanja — idealno za pravosudni ispit.</p>
          <p><strong className="text-foreground">Leech:</strong> Nakon {local.leechThreshold} padova, cjelina se označava kao problematična.</p>
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
