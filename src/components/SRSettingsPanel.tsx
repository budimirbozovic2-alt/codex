import { useState, useEffect } from "react";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { TTSSettings, DEFAULT_TTS_SETTINGS, loadTTSSettings, saveTTSSettings, getAvailableVoices, speak, stopSpeaking } from "@/lib/tts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Volume2 } from "lucide-react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as Settings } from "lucide-react/dist/esm/icons/settings";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Flame } from "lucide-react/dist/esm/icons/flame";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import InfoPanel from "@/components/InfoPanel";

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
  const [tts, setTts] = useState<TTSSettings>(loadTTSSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      const v = getAvailableVoices();
      if (v.length > 0) setVoices(v);
    };
    loadVoices();
    if ("speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const handleChange = (key: keyof SRSettings, value: number) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(local);
    saveTTSSettings(tts);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SR_SETTINGS });
  };

  const testVoice = () => {
    speak("Ovo je test govora. Memoria MNE.", tts);
  };

  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings) ||
    JSON.stringify(tts) !== JSON.stringify(loadTTSSettings());
  const isDefault = JSON.stringify(local) === JSON.stringify(DEFAULT_SR_SETTINGS);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-3xl font-serif">Podešavanja</h2>
          <p className="text-muted-foreground mt-1">Algoritam ponavljanja, glasovni čitač i alati</p>
        </div>
        <InfoPanel title="O podešavanjima">
          <p><strong className="text-foreground">FSRS v5</strong> — algoritam za optimalni raspored ponavljanja sa 95% stopom zadržavanja.</p>
          <p><strong className="text-foreground">Leech prag</strong> — kartice koje padnu više od N puta se označavaju kao problematične.</p>
          <p><strong className="text-foreground">Kognitivni otpor</strong> — težine za izračun kombinovanog skora otpora (lapsusi, latencija, zaboravljanje).</p>
          <p><strong className="text-foreground">TTS</strong> — podesi brzinu i glas za funkciju čitanja naglas.</p>
        </InfoPanel>
      </div>

      {/* Section 1: Ponavljanje */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Ponavljanje (FSRS)</h3>
        </div>
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
      </section>

      {/* Section 2: Kognitivni otpor */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Flame className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Težine kognitivnog otpora</h3>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <p className="text-xs text-muted-foreground">Podesi koliko svaki faktor utiče na ukupni skor otpora. Vrijednosti se automatski normalizuju.</p>
          {([
            { key: "lapses" as const, label: "Lapsusi (padovi)", icon: "❌" },
            { key: "latency" as const, label: "Latencija (vrijeme prisjećanja)", icon: "⏱️" },
            { key: "forgetting" as const, label: "Zaboravljanje (retrievability)", icon: "📉" },
          ]).map(({ key, label, icon }) => {
            const w = local.resistanceWeights ?? { lapses: 40, latency: 30, forgetting: 30 };
            const total = w.lapses + w.latency + w.forgetting;
            const pct = total > 0 ? Math.round((w[key] / total) * 100) : 33;
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{icon} {label}</label>
                  <span className="text-xs text-muted-foreground tabular-nums">{w[key]} ({pct}%)</span>
                </div>
                <Slider
                  value={[w[key]]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={(v) => setLocal(prev => ({
                    ...prev,
                    resistanceWeights: { ...(prev.resistanceWeights ?? { lapses: 40, latency: 30, forgetting: 30 }), [key]: v[0] }
                  }))}
                />
              </div>
            );
          })}
          <div className="flex gap-2 text-xs text-muted-foreground pt-1">
            <span>Ukupno: {(local.resistanceWeights?.lapses ?? 40) + (local.resistanceWeights?.latency ?? 30) + (local.resistanceWeights?.forgetting ?? 30)}</span>
            <span className="opacity-50">•</span>
            <span>Normalizovano na 100%</span>
          </div>
        </div>
      </section>

      {/* Section 3: Glasovni čitač */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Volume2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Glasovni čitač (TTS)</h3>
        </div>
        <div className="rounded-xl border bg-card p-4 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Brzina govora</label>
              <span className="text-sm text-muted-foreground tabular-nums">{tts.rate.toFixed(2)}×</span>
            </div>
            <Slider
              value={[tts.rate]}
              min={0.5}
              max={2}
              step={0.05}
              onValueChange={(v) => setTts((p) => ({ ...p, rate: v[0] }))}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Sporo</span>
              <span>Normalno</span>
              <span>Brzo</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Glas</label>
            <Select
              value={tts.voiceURI || "__default__"}
              onValueChange={(v) => setTts((p) => ({ ...p, voiceURI: v === "__default__" ? "" : v }))}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Sistemski podrazumijevani" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Sistemski podrazumijevani</SelectItem>
                {voices.map((v) => (
                  <SelectItem key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" size="sm" onClick={testVoice} className="gap-1.5">
            <Volume2 className="h-3.5 w-3.5" /> Testiraj glas
          </Button>
        </div>
      </section>

      {/* Section 4: Referenca */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Referenca</h3>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-3">
          <h4 className="text-sm font-medium">Kako FSRS računa intervale</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3 space-y-1">
              <p className="font-medium text-destructive">Opet (1)</p>
              <p>Stabilnost pada na 10%. Težina +2.</p>
            </div>
            <div className="rounded-lg bg-warning/5 border border-warning/10 p-3 space-y-1">
              <p className="font-medium text-warning">Teško (2)</p>
              <p>Stabilnost ×1.5 + 0.5d. Težina +1.</p>
            </div>
            <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 space-y-1">
              <p className="font-medium text-primary">Dobro (3)</p>
              <p>Stabilnost ×3.0 + 1.0d. Težina ista.</p>
            </div>
            <div className="rounded-lg bg-success/5 border border-success/10 p-3 space-y-1">
              <p className="font-medium text-success">Lako (4)</p>
              <p>Stabilnost ×5.0 + 2.0d. Težina -1.</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground pt-1 space-y-1">
            <p><strong className="text-foreground">Interval:</strong> Računa se za 95% stopu zadržavanja.</p>
            <p><strong className="text-foreground">Leech:</strong> Nakon {local.leechThreshold} padova, cjelina se označava kao problematična.</p>
          </div>
        </div>

      </section>

      {/* Action buttons */}
      <div className="flex gap-3 pb-8">
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
