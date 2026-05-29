import { AppSettings } from "@/lib/app-settings";
import { TTSSettings, speak } from "@/lib/tts";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  app: AppSettings;
  setApp: React.Dispatch<React.SetStateAction<AppSettings>>;
  tts: TTSSettings;
  setTts: React.Dispatch<React.SetStateAction<TTSSettings>>;
  voices: SpeechSynthesisVoice[];
}

export default function WorkflowTab({ app, setApp, tts, setTts, voices }: Props) {
  return (
    <div className="space-y-5">
      {/* Pomodoro tajmer */}
      <div className="glass-card rounded-xl p-5 space-y-4">
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
              <SelectTrigger className="w-24 h-9 bg-background">
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
      <div className="glass-card rounded-xl p-5 space-y-4">
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
            <SelectTrigger className="h-9 bg-background">
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
      <div className="glass-card rounded-xl p-5 space-y-4">
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
                <SelectTrigger className="w-20 h-9 bg-background">
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
                <SelectTrigger className="w-20 h-9 bg-background">
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
      <div className="glass-card rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold">Backup podsjetnik</h3>
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm">Backup podsjetnik</label>
            <p className="text-xs text-muted-foreground">Upozorenje na dashboardu</p>
          </div>
          <Select value={String(app.autoBackupDays)}
            onValueChange={(v) => setApp(prev => ({ ...prev, autoBackupDays: parseInt(v) }))}>
            <SelectTrigger className="w-28 h-9 bg-background">
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
    </div>
  );
}
