import { AppSettings } from "@/lib/app-settings";
import { TTSSettings, speak } from "@/lib/tts";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SettingsSection from "@/components/settings/SettingsSection";
import { SettingsRow, SettingsRowWide } from "@/components/settings/SettingsRow";

interface Props {
  app: AppSettings;
  setApp: React.Dispatch<React.SetStateAction<AppSettings>>;
  tts: TTSSettings;
  setTts: React.Dispatch<React.SetStateAction<TTSSettings>>;
  voices: SpeechSynthesisVoice[];
}

export default function WorkflowTab({ app, setApp, tts, setTts, voices }: Props) {
  return (
    <div className="space-y-8">
      <SettingsSection title="Pomodoro" description="Podesi trajanje fokus i pauza sesija.">
        <SettingsRowWide label="Fokus sesija">
          <div className="space-y-1.5">
            <div className="flex justify-end">
              <span className="text-sm font-medium tabular-nums">{app.pomodoro.workMinutes} min</span>
            </div>
            <Slider
              value={[app.pomodoro.workMinutes]}
              min={10}
              max={60}
              step={5}
              onValueChange={(v) =>
                setApp((prev) => ({
                  ...prev,
                  pomodoro: { ...prev.pomodoro, workMinutes: v[0] },
                }))
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>10 min</span>
              <span>60 min</span>
            </div>
          </div>
        </SettingsRowWide>

        <SettingsRowWide label="Pauza">
          <div className="space-y-1.5">
            <div className="flex justify-end">
              <span className="text-sm font-medium tabular-nums">{app.pomodoro.breakMinutes} min</span>
            </div>
            <Slider
              value={[app.pomodoro.breakMinutes]}
              min={1}
              max={20}
              step={1}
              onValueChange={(v) =>
                setApp((prev) => ({
                  ...prev,
                  pomodoro: { ...prev.pomodoro, breakMinutes: v[0] },
                }))
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1 min</span>
              <span>20 min</span>
            </div>
          </div>
        </SettingsRowWide>

        <SettingsRowWide label="Dugačka pauza">
          <div className="space-y-1.5">
            <div className="flex justify-end">
              <span className="text-sm font-medium tabular-nums">{app.pomodoro.longBreakMinutes} min</span>
            </div>
            <Slider
              value={[app.pomodoro.longBreakMinutes]}
              min={5}
              max={30}
              step={5}
              onValueChange={(v) =>
                setApp((prev) => ({
                  ...prev,
                  pomodoro: { ...prev.pomodoro, longBreakMinutes: v[0] },
                }))
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>5 min</span>
              <span>30 min</span>
            </div>
          </div>
        </SettingsRowWide>

        <SettingsRow
          label="Interval dugačke pauze"
          hint="Nakon svakog N-tog fokus ciklusa"
        >
          <Select
            value={String(app.pomodoro.longBreakInterval)}
            onValueChange={(v) =>
              setApp((prev) => ({
                ...prev,
                pomodoro: { ...prev.pomodoro, longBreakInterval: parseInt(v) },
              }))
            }
          >
            <SelectTrigger className="w-28 h-9 bg-background">
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
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Glasovni čitač (TTS)">
        <SettingsRowWide label="Brzina govora">
          <div className="space-y-1.5">
            <div className="flex justify-end">
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
        </SettingsRowWide>

        <SettingsRow label="Glas">
          <Select
            value={tts.voiceURI || "__default__"}
            onValueChange={(v) =>
              setTts((p) => ({ ...p, voiceURI: v === "__default__" ? "" : v }))
            }
          >
            <SelectTrigger className="w-48 h-9 bg-background">
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
        </SettingsRow>

        <SettingsRowWide label="Test">
          <Button
            variant="outline"
            size="sm"
            onClick={() => speak("Ovo je test govora. CODEX.")}
            className="gap-1.5"
          >
            Testiraj glas
          </Button>
        </SettingsRowWide>
      </SettingsSection>

      <SettingsSection
        title="Podsjetnici"
        description="Browser notifikacija koja te podsjeća da učiš."
      >
        <SettingsRow
          label="Dnevni podsjetnik"
          hint="Šalje notifikaciju u odabrano vrijeme"
        >
          <Switch
            checked={app.notifications.enabled}
            onCheckedChange={(v) => {
              if (v && "Notification" in window && Notification.permission !== "granted") {
                Notification.requestPermission().then((perm) => {
                  if (perm === "granted") {
                    setApp((prev) => ({
                      ...prev,
                      notifications: { ...prev.notifications, enabled: true },
                    }));
                  }
                });
              } else {
                setApp((prev) => ({
                  ...prev,
                  notifications: { ...prev.notifications, enabled: v },
                }));
              }
            }}
          />
        </SettingsRow>

        {app.notifications.enabled && (
          <SettingsRow label="Vrijeme podsjetnika">
            <div className="flex items-center gap-1.5">
              <Select
                value={String(app.notifications.reminderHour)}
                onValueChange={(v) =>
                  setApp((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, reminderHour: parseInt(v) },
                  }))
                }
              >
                <SelectTrigger className="w-20 h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, "0")}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">:</span>
              <Select
                value={String(app.notifications.reminderMinute)}
                onValueChange={(v) =>
                  setApp((prev) => ({
                    ...prev,
                    notifications: { ...prev.notifications, reminderMinute: parseInt(v) },
                  }))
                }
              >
                <SelectTrigger className="w-20 h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 15, 30, 45].map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {String(m).padStart(2, "0")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </SettingsRow>
        )}
      </SettingsSection>

      <SettingsSection title="Backup podsjetnik">
        <SettingsRow label="Backup podsjetnik" hint="Upozorenje na dashboardu">
          <Select
            value={String(app.autoBackupDays)}
            onValueChange={(v) =>
              setApp((prev) => ({ ...prev, autoBackupDays: parseInt(v) }))
            }
          >
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
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}
