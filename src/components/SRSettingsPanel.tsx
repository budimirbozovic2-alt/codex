import { useState, useEffect, useRef } from "react";
import { SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { AppSettings, DEFAULT_APP_SETTINGS, loadAppSettings, saveAppSettings, COLOR_THEMES, applyColorTheme, type ColorTheme } from "@/lib/app-settings";
import { TTSSettings, DEFAULT_TTS_SETTINGS, loadTTSSettings, saveTTSSettings, getAvailableVoices, speak } from "@/lib/tts";
import { playGradeGood } from "@/lib/sounds";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";




import InfoPanel from "@/components/InfoPanel";
import HealthMonitor from "@/components/HealthMonitor";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
interface Props {
  settings: SRSettings;
  onUpdate: (settings: SRSettings) => void;
  onBack: () => void;
}

export default function SRSettingsPanel({ settings, onUpdate, onBack }: Props) {
  const [local, setLocal] = useState<SRSettings>({ ...settings });
  const initialAppRef = useRef(loadAppSettings());
  const initialTtsRef = useRef(loadTTSSettings());
  const [app, setApp] = useState<AppSettings>(initialAppRef.current);
  const [tts, setTts] = useState<TTSSettings>(initialTtsRef.current);
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
    return () => { if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = null; };
  }, []);
  const handleChange = (key: keyof SRSettings, value: number) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(local);
    saveTTSSettings(tts);
    saveAppSettings(app);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SR_SETTINGS });
    setApp({ ...DEFAULT_APP_SETTINGS });
  };


  const hasChanges = JSON.stringify(local) !== JSON.stringify(settings) ||
    JSON.stringify(tts) !== JSON.stringify(initialTtsRef.current) ||
    JSON.stringify(app) !== JSON.stringify(initialAppRef.current);
  const isDefault = JSON.stringify(local) === JSON.stringify(DEFAULT_SR_SETTINGS) &&
    JSON.stringify(app) === JSON.stringify(DEFAULT_APP_SETTINGS);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
            <ArrowLeft className="h-4 w-4" /> Nazad
          </button>
          <h2 className="text-2xl font-serif">Podešavanja</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Algoritam, interfejs, tok rada i sistem</p>
        </div>
        <InfoPanel title="O podešavanjima">
          <p><strong className="text-foreground">FSRS v5</strong> — algoritam za optimalni raspored ponavljanja.</p>
          <p><strong className="text-foreground">Ciljna retencija</strong> — podesi stopu zadržavanja (85-99%).</p>
          <p><strong className="text-foreground">Dashboard</strong> — prilagodi koje widgete vidiš na pregledu.</p>
          <p><strong className="text-foreground">Zvučni efekti</strong> — tonovi pri ocjenjivanju i završetku sesije.</p>
          <p><strong className="text-foreground">TTS</strong> — podesi brzinu i glas za čitanje naglas.</p>
        </InfoPanel>
      </div>

      <Tabs defaultValue="algorithm" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="algorithm">Algoritam</TabsTrigger>
          <TabsTrigger value="interface">Interfejs</TabsTrigger>
          <TabsTrigger value="workflow">Tok rada</TabsTrigger>
          <TabsTrigger value="system">Sistem</TabsTrigger>
        </TabsList>

        {/* ═══════════ TAB 1: ALGORITAM ═══════════ */}
        <TabsContent value="algorithm" className="space-y-5 mt-0">
          {/* Ciljna retencija */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
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
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Ponavljanje (FSRS)</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm">Leech prag</label>
                  <p className="text-xs text-muted-foreground">Padovi za oznaku problematične cjeline</p>
                </div>
                <Input type="number" value={local.leechThreshold} onChange={(e) => handleChange("leechThreshold", parseFloat(e.target.value) || 2)}
                  min={2} max={20} step={1} className="w-20 text-right bg-background" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm">Dnevni cilj</label>
                  <p className="text-xs text-muted-foreground">Ponavljanja dnevno</p>
                </div>
                <Input type="number" value={local.dailyGoal} onChange={(e) => handleChange("dailyGoal", parseFloat(e.target.value) || 5)}
                  min={5} max={100} step={5} className="w-20 text-right bg-background" />
              </div>
            </div>
          </div>

          {/* Kognitivni otpor */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
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
        </TabsContent>

        {/* ═══════════ TAB 2: INTERFEJS ═══════════ */}
        <TabsContent value="interface" className="space-y-5 mt-0">
          {/* Color theme picker */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
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
                      style={{
                        backgroundColor: theme.preview,
                        color: theme.preview,
                      }}
                    />
                    <span className="text-xs font-medium">{theme.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dashboard widgeti */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Dashboard widgeti</h3>
            <p className="text-xs text-muted-foreground">Odaberi koje widgete želiš vidjeti.</p>
            {([
              { key: "showExamProgress" as const, label: "Napredak do cilja" },
              { key: "showCoreStats" as const, label: "Brojači (Due / Naučeno)" },
              { key: "showBriefing" as const, label: "Dnevni briefing" },
              { key: "showIdealFocus" as const, label: "Idealni fokus" },
              { key: "showVelocity" as const, label: "Brzina učenja" },
              { key: "showWeakCategories" as const, label: "Najslabije kategorije" },
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
          <div className="rounded-xl border bg-card p-5 space-y-4">
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
                    setTimeout(() => playGradeGood(), 100);
                  }
                }}
              />
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ TAB 3: TOK RADA ═══════════ */}
        <TabsContent value="workflow" className="space-y-5 mt-0">
          {/* Pomodoro tajmer */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Pomodoro tajmer</h3>
            <p className="text-xs text-muted-foreground">Podesi trajanje fokus i pauza sesija.</p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm">Fokus sesija</label>
                  <span className="text-sm font-medium tabular-nums">{app.pomodoro.workMinutes} min</span>
                </div>
                <Slider
                  value={[app.pomodoro.workMinutes]}
                  min={10} max={60} step={5}
                  onValueChange={(v) => setApp(prev => ({ ...prev, pomodoro: { ...prev.pomodoro, workMinutes: v[0] } }))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>10 min</span><span>60 min</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm">Pauza</label>
                  <span className="text-sm font-medium tabular-nums">{app.pomodoro.breakMinutes} min</span>
                </div>
                <Slider
                  value={[app.pomodoro.breakMinutes]}
                  min={1} max={20} step={1}
                  onValueChange={(v) => setApp(prev => ({ ...prev, pomodoro: { ...prev.pomodoro, breakMinutes: v[0] } }))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>1 min</span><span>20 min</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm">Dugačka pauza</label>
                  <span className="text-sm font-medium tabular-nums">{app.pomodoro.longBreakMinutes} min</span>
                </div>
                <Slider
                  value={[app.pomodoro.longBreakMinutes]}
                  min={5} max={30} step={5}
                  onValueChange={(v) => setApp(prev => ({ ...prev, pomodoro: { ...prev.pomodoro, longBreakMinutes: v[0] } }))}
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>5 min</span><span>30 min</span>
                </div>
              </div>
              <div className="border-t pt-3 flex items-center justify-between">
                <div>
                  <label className="text-sm">Interval dugačke pauze</label>
                  <p className="text-xs text-muted-foreground">Nakon svakog N-tog fokus ciklusa</p>
                </div>
                <Select value={String(app.pomodoro.longBreakInterval)}
                  onValueChange={(v) => setApp(prev => ({ ...prev, pomodoro: { ...prev.pomodoro, longBreakInterval: parseInt(v) } }))}>
                  <SelectTrigger className="w-24 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Isključeno</SelectItem>
                    <SelectItem value="2">Svaka 2</SelectItem>
                    <SelectItem value="3">Svaka 3</SelectItem>
                    <SelectItem value="4">Svaka 4</SelectItem>
                    <SelectItem value="5">Svaka 5</SelectItem>
                    <SelectItem value="6">Svaka 6</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* TTS */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Glasovni čitač (TTS)</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm">Brzina govora</label>
                <span className="text-sm text-muted-foreground tabular-nums">{tts.rate.toFixed(2)}×</span>
              </div>
              <Slider value={[tts.rate]} min={0.5} max={2} step={0.05}
                onValueChange={(v) => setTts((p) => ({ ...p, rate: v[0] }))} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Sporo</span><span>Normalno</span><span>Brzo</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm">Glas</label>
              <Select value={tts.voiceURI || "__default__"}
                onValueChange={(v) => setTts((p) => ({ ...p, voiceURI: v === "__default__" ? "" : v }))}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Sistemski podrazumijevani" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">Sistemski podrazumijevani</SelectItem>
                  {voices.map((v) => (
                    <SelectItem key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={() => speak("Ovo je test govora. CODEX.")} className="gap-1.5">
              Testiraj glas
            </Button>
          </div>

          {/* Podsjetnici */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Podsjetnik za ponavljanje</h3>
            <p className="text-xs text-muted-foreground">Browser notifikacija koja te podsjeća da učiš.</p>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm">Dnevni podsjetnik</label>
                <p className="text-xs text-muted-foreground">Šalje notifikaciju u odabrano vrijeme</p>
              </div>
              <Switch
                checked={app.notifications.enabled}
                onCheckedChange={(v) => {
                  if (v && "Notification" in window && Notification.permission !== "granted") {
                    Notification.requestPermission().then(perm => {
                      if (perm === "granted") {
                        setApp(prev => ({ ...prev, notifications: { ...prev.notifications, enabled: true } }));
                      }
                    });
                  } else {
                    setApp(prev => ({ ...prev, notifications: { ...prev.notifications, enabled: v } }));
                  }
                }}
              />
            </div>
            {app.notifications.enabled && (
              <div className="flex items-center gap-3 border-t pt-3">
                <label className="text-sm text-muted-foreground">Vrijeme:</label>
                <div className="flex items-center gap-1.5">
                  <Select value={String(app.notifications.reminderHour)}
                    onValueChange={(v) => setApp(prev => ({ ...prev, notifications: { ...prev.notifications, reminderHour: parseInt(v) } }))}>
                    <SelectTrigger className="w-20 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>{String(i).padStart(2, "0")}h</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground">:</span>
                  <Select value={String(app.notifications.reminderMinute)}
                    onValueChange={(v) => setApp(prev => ({ ...prev, notifications: { ...prev.notifications, reminderMinute: parseInt(v) } }))}>
                    <SelectTrigger className="w-20 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[0, 15, 30, 45].map(m => (
                        <SelectItem key={m} value={String(m)}>{String(m).padStart(2, "0")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          {/* Backup podsjetnik */}
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">Backup podsjetnik</h3>
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm">Backup podsjetnik</label>
                <p className="text-xs text-muted-foreground">Upozorenje na dashboardu</p>
              </div>
              <Select value={String(app.autoBackupDays)}
                onValueChange={(v) => setApp(prev => ({ ...prev, autoBackupDays: parseInt(v) }))}>
                <SelectTrigger className="w-28 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Isključeno</SelectItem>
                  <SelectItem value="3">3 dana</SelectItem>
                  <SelectItem value="7">7 dana</SelectItem>
                  <SelectItem value="14">14 dana</SelectItem>
                  <SelectItem value="30">30 dana</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </TabsContent>

        {/* ═══════════ TAB 4: SISTEM ═══════════ */}
        <TabsContent value="system" className="space-y-5 mt-0">
          {/* Health Monitor */}
          <HealthMonitor />

          {/* Kako ocjene rade */}
          <div className="rounded-xl border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Kako FSRS računa intervale</h3>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
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
          </div>

          {/* FSRS Vodič - Collapsibles */}
          <div className="rounded-xl border bg-card p-5 space-y-4 text-sm text-muted-foreground">
            <h3 className="text-sm font-semibold text-foreground">Kako radi FSRS — vodič</h3>
            <p>
              FSRS (<em>Free Spaced Repetition Scheduler</em>) je algoritam koji odlučuje <strong className="text-foreground">kada</strong> treba da ponoviš neku cjelinu.
              Cilj: ponavljaj <em>tačno prije nego što zaboraviš</em>.
            </p>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                🧱 Stabilnost (Stability)
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-2">
                <p>Broj koji predstavlja <strong className="text-foreground">koliko dugo možeš zadržati informaciju</strong>, u danima.</p>
                <p>Ako je stabilnost = 10, nakon 10 dana imaš ~90% šanse da se prisjetiš.</p>
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <p>🟢 "Dobro" ili "Lako" → stabilnost raste</p>
                  <p>🔴 "Opet" → stabilnost drastično pada</p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                ⚖️ Težina (Difficulty)
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-2">
                <p>Broj od <strong className="text-foreground">1 do 10</strong> — koliko ti je cjelina teška. Automatski se podešava.</p>
                <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                  <p>"Opet" → težina +2 | "Teško" → +1.5 | "Dobro" → isto | "Lako" → -1</p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                📊 Retencija (Retrievability)
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-2">
                <p><strong className="text-foreground">Vjerovatnoća da se sjećaš</strong> u ovom trenutku (0–100%).</p>
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                  <p>Formula: <code className="bg-background px-1.5 py-0.5 rounded text-foreground">R = e^(-dani / stabilnost)</code></p>
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                🎯 Kako ocjene utiču na intervale
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-2">
                <div className="space-y-2 text-xs">
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                    <p className="font-medium text-destructive">❌ Opet (1)</p>
                    <p>Stabilnost pada na 5%. Interval: <strong>20 min</strong>. Bilježi lapsus.</p>
                  </div>
                  <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 space-y-1">
                    <p className="font-medium text-warning">⚠️ Teško (2)</p>
                    <p>Stabilnost pada na 30%. Interval: max 24h.</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-1">
                    <p className="font-medium text-primary">✅ Dobro (3)</p>
                    <p>Stabilnost × 3.0 + 1 dan. Standardna ocjena.</p>
                  </div>
                  <div className="rounded-lg border border-success/20 bg-success/5 p-3 space-y-1">
                    <p className="font-medium text-success">🚀 Lako (4)</p>
                    <p>Stabilnost × 5.0 + 2 dana. Instant recall.</p>
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
                <p>Nakon {local.leechThreshold} padova na istoj cjelini, sistem je označava kao <em>leech</em>.</p>
                <p>Signal da trebaš promijeniti pristup: preformuliši pitanje, dodaj mnemonik, razbi na manje dijelove.</p>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-foreground hover:text-primary transition-colors group">
                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                💡 Praktični savjeti
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 pl-6 space-y-2">
                <ul className="space-y-1.5 list-disc list-inside text-xs">
                  <li>"Dobro" je podrazumijevana ocjena</li>
                  <li>"Lako" samo kad je prisjećanje trenutno</li>
                  <li>U dilemi — radije "Teško" nego "Dobro"</li>
                  <li>20 kartica dnevno &gt; 100 jednom sedmično</li>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </TabsContent>
      </Tabs>

      {/* Action buttons — always visible */}
      <div className="flex gap-3 pb-4">
        <Button onClick={handleSave} disabled={!hasChanges} className="flex-1">
          Sačuvaj izmjene
        </Button>
        <Button onClick={handleReset} variant="outline" disabled={isDefault}>
          <RotateCcw className="h-4 w-4 mr-2" /> Podrazumijevano
        </Button>
      </div>
      <div className="pb-8" />
    </div>
  );
}
