import { default as Timer } from "lucide-react/dist/esm/icons/timer";
import { default as Play } from "lucide-react/dist/esm/icons/play";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useUIContext } from "@/contexts/AppContext";

export default function PomodoroTimer({ compact = false }: { compact?: boolean }) {
  const { pomodoro, pomodoroToggle, pomodoroReset } = useUIContext();
  const { mode, seconds, running } = pomodoro;

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = mode === "work"
    ? ((25 * 60 - seconds) / (25 * 60)) * 100
    : ((5 * 60 - seconds) / (5 * 60)) * 100;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Timer className="h-3.5 w-3.5 text-primary" />
        <span className={`text-sm font-mono tabular-nums ${running ? "text-primary font-medium" : "text-muted-foreground"}`}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
        <button
          onClick={pomodoroToggle}
          className="p-1 rounded hover:bg-secondary transition-colors"
        >
          {running ? (
            <span className="text-xs text-muted-foreground">⏸</span>
          ) : (
            <Play className="h-3 w-3 text-primary" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">{mode === "work" ? "Fokus" : "Pauza"}</h3>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${mode === "work" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>
          {mode === "work" ? "25 min" : "5 min"}
        </span>
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
