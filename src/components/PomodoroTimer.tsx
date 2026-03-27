import { Timer, Play } from "lucide-react";
import { useMemo } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { usePomodoroContext } from "@/contexts/AppContext";
import { loadAppSettings } from "@/lib/app-settings";
const MODE_LABELS: Record<string, string> = { work: "Fokus", break: "Pauza", longBreak: "Dugačka pauza" };
const MODE_BADGE_CLASS: Record<string, string> = {
  work: "bg-primary/10 text-primary",
  break: "bg-success/10 text-success",
  longBreak: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export default function PomodoroTimer({ compact = false }: { compact?: boolean }) {
  const { pomodoro, pomodoroToggle, pomodoroReset } = usePomodoroContext();
  const { mode, seconds, running, cycleCount } = pomodoro;
  // Cache settings on mount — avoids localStorage parse every render tick
  const pom = useMemo(() => loadAppSettings().pomodoro, []);

  const totalSec = mode === "work" ? pom.workMinutes * 60
    : mode === "longBreak" ? pom.longBreakMinutes * 60
    : pom.breakMinutes * 60;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = ((totalSec - seconds) / totalSec) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Timer className="h-3.5 w-3.5 text-primary" />
        <span className={`text-sm font-mono tabular-nums ${running ? "text-primary font-medium" : "text-muted-foreground"}`}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
        {pom.longBreakInterval > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {cycleCount % pom.longBreakInterval}/{pom.longBreakInterval}
          </span>
        )}
        <button onClick={pomodoroToggle} className="p-1 rounded hover:bg-secondary transition-colors">
          {running ? <span className="text-xs text-muted-foreground">⏸</span> : <Play className="h-3 w-3 text-primary" />}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{MODE_LABELS[mode]}</h3>
        </div>
        <div className="flex items-center gap-2">
          {pom.longBreakInterval > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              Ciklus {cycleCount % pom.longBreakInterval}/{pom.longBreakInterval}
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full ${MODE_BADGE_CLASS[mode]}`}>
            {mode === "work" ? `${pom.workMinutes} min` : mode === "longBreak" ? `${pom.longBreakMinutes} min` : `${pom.breakMinutes} min`}
          </span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-4xl font-serif tabular-nums">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</p>
      </div>
      <Progress value={progress} className="h-1.5" />
      <div className="flex gap-2 justify-center">
        <Button variant={running ? "outline" : "default"} size="sm" onClick={pomodoroToggle} className="gap-1.5">
          {running ? "Pauziraj" : <><Play className="h-3.5 w-3.5" /> Pokreni</>}
        </Button>
        <Button variant="ghost" size="sm" onClick={pomodoroReset}>Reset</Button>
      </div>
    </div>
  );
}
