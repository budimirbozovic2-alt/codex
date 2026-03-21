import { useState, useEffect } from "react";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { TTSSettings, DEFAULT_TTS_SETTINGS, loadTTSSettings, saveTTSSettings, getAvailableVoices, speak, stopSpeaking } from "@/lib/tts";
import { AppSettings, DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings } from "@/lib/app-settings";
import { playGradeGood } from "@/lib/sounds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Volume2 } from "lucide-react";
import { default as ArrowLeft } from "lucide-react/dist/esm/icons/arrow-left";
import { default as RotateCcw } from "lucide-react/dist/esm/icons/rotate-ccw";
import { default as Settings } from "lucide-react/dist/esm/icons/settings";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Flame } from "lucide-react/dist/esm/icons/flame";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as ChevronDown } from "lucide-react/dist/esm/icons/chevron-down";
import { default as GraduationCap } from "lucide-react/dist/esm/icons/graduation-cap";
import { default as LayoutDashboard } from "lucide-react/dist/esm/icons/layout-dashboard";
import { default as Shield } from "lucide-react/dist/esm/icons/shield";
import { default as BellRing } from "lucide-react/dist/esm/icons/bell-ring";
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

      {/* Section 5: FSRS Vodič */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b">
          <GraduationCap className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Kako radi FSRS — vodič</h3>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-5 text-sm text-muted-foreground">
          <div className="space-y-2">
            <h4 className="text-base font-medium text-foreground">📖 Šta je FSRS?</h4>
            <p>
              FSRS (<em>Free Spaced Repetition Scheduler</em>) je algoritam koji odlučuje <strong className="text-foreground">kada</strong> treba da ponoviš neku cjelinu.
              Cilj je jednostavan: ponavljaj <em>tačno prije nego što zaboraviš</em>, ni prerano (gubljenje vremena) ni prekasno (zaboravljeno).
            </p>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              🧱 Stabilnost (Stability)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-6 space-y-2">
              <p>
                Stabilnost je broj koji predstavlja <strong className="text-foreground">koliko dugo možeš zadržati informaciju u sjećanju</strong>.
                Mjeri se u danima.
              </p>
              <p>
                Ako je stabilnost = 10, to znači da ćeš nakon 10 dana imati ~90% šanse da se prisjetiš.
                Što je stabilnost veća, to duže pamtiš — i sistem ti daje duže pauze između ponavljanja.
              </p>
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p>🟢 Ocjena <strong className="text-foreground">"Dobro"</strong> ili <strong className="text-foreground">"Lako"</strong> → stabilnost raste (intervali se produžavaju)</p>
                <p>🔴 Ocjena <strong className="text-foreground">"Opet"</strong> → stabilnost drastično pada (vraćaš se skoro na početak)</p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              ⚖️ Težina (Difficulty)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-6 space-y-2">
              <p>
                Težina je broj od <strong className="text-foreground">1 do 10</strong> koji pokazuje koliko ti je neka cjelina teška.
                Sistem je automatski podešava na osnovu tvojih ocjena.
              </p>
              <p>
                Ako stalno grešiš na istoj cjelini, težina raste — sistem shvata da ti je to teže i daje kraće intervale.
                Ako odgovaraš tačno, težina se smanjuje.
              </p>
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p><strong className="text-foreground">"Opet"</strong> → težina +2 (mnogo teže)</p>
                <p><strong className="text-foreground">"Teško"</strong> → težina +1.5</p>
                <p><strong className="text-foreground">"Dobro"</strong> → bez promjene</p>
                <p><strong className="text-foreground">"Lako"</strong> → težina -1 (lakše)</p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              📊 Retencija (Retrievability)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-6 space-y-2">
              <p>
                Retencija je <strong className="text-foreground">vjerovatnoća da se sjećaš nečega u ovom trenutku</strong>, izražena u procentima (0–100%).
              </p>
              <p>
                Odmah nakon ponavljanja, retencija je ~100%. Kako dani prolaze, ona polako opada po krivulji zaboravljanja.
                Sistem je podešen da ti zakaže ponavljanje <strong className="text-foreground">prije nego retencija padne ispod 95%</strong>.
              </p>
              <div className="rounded-lg bg-muted/50 p-3 text-xs">
                <p>Formula: <code className="bg-background px-1.5 py-0.5 rounded text-foreground">R = e^(-protekli_dani / stabilnost)</code></p>
                <p className="mt-1 opacity-75">Primjer: stabilnost 10d, prošlo 5 dana → R ≈ 61%. Ako je prošao samo 1 dan → R ≈ 90%.</p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              🎯 Kako ocjene utiču na intervale
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-6 space-y-2">
              <p>Svaka ocjena direktno mijenja stabilnost i težinu, a time i sljedeći interval:</p>
              <div className="space-y-2">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs space-y-1">
                  <p className="font-medium text-destructive">❌ Opet (1) — "Nemam pojma"</p>
                  <p>Stabilnost pada na 5% prethodne. Interval: <strong>20 minuta</strong>. Bilježi se kao lapsus.</p>
                </div>
                <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-xs space-y-1">
                  <p className="font-medium text-warning">⚠️ Teško (2) — "Promašio sam ključne detalje"</p>
                  <p>Stabilnost pada na 30%. Interval: <strong>max 24 sata</strong>. Za situacije kad znaš odgovor ali grešiš detalje.</p>
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                  <p className="font-medium text-primary">✅ Dobro (3) — "Znam odgovor + detalje"</p>
                  <p>Stabilnost × 3.0 + 1 dan. Standardna ocjena — koristite kad ste sigurni u odgovor.</p>
                </div>
                <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-xs space-y-1">
                  <p className="font-medium text-success">🚀 Lako (4) — "Znao sam bez oklijevanja"</p>
                  <p>Stabilnost × 5.0 + 2 dana. Najbrži rast intervala — koristite samo kad je instant recall.</p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              🚨 Leech (problematične cjeline)
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-6 space-y-2">
              <p>
                Ako na istoj cjelini pritisneš <strong className="text-foreground">"Opet"</strong> više od {local.leechThreshold} puta,
                sistem je označava kao <em>leech</em> — problematičnu cjelinu koja "upija" tvoje vrijeme.
              </p>
              <p>
                To je signal da treba promijeniti pristup: preformuliši pitanje, dodaj mnemonik, 
                razbi cjelinu na manje dijelove, ili koristi mod <strong className="text-foreground">"Samo teške kartice"</strong> u Konsolidaciji.
              </p>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
              💡 Praktični savjeti
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pl-6 space-y-2">
              <ul className="space-y-1.5 list-disc list-inside">
                <li>Koristi <strong className="text-foreground">"Dobro"</strong> kao podrazumijevanu ocjenu — to je najčešći slučaj</li>
                <li><strong className="text-foreground">"Lako"</strong> koristi samo kad je prisjećanje trenutno — inače precjenjuješ stabilnost</li>
                <li>Bolje je pritisnuti <strong className="text-foreground">"Teško"</strong> nego <strong className="text-foreground">"Dobro"</strong> ako si u dilemi — kraći interval je sigurniji</li>
                <li>Redovnost je ključna: 20 kartica dnevno je bolje od 100 kartica jednom sedmično</li>
                <li>Nove kartice prolaze "pravilo 20 minuta" — prvi test je nakon 15–20 min da se utvrdi kratkoročno pamćenje</li>
              </ul>
            </CollapsibleContent>
          </Collapsible>
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
