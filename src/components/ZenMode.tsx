import { Volume2, X, Play, Pause, VolumeX, RotateCcw, Timer, Coffee, Brain, SkipForward } from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startAmbient, stopAmbient, setAmbientVolume, isAmbientPlaying, AMBIENT_TRACKS, type AmbientTrack } from "@/lib/ambient-audio";
import { addPomodoroEntry, getPomodoroStats } from "@/lib/storage";
import { loadAppSettings } from "@/lib/app-settings";
import { cn } from "@/lib/utils";

type TimerPhase = "focus" | "break" | "longBreak";

interface Props {
  active: boolean;
  onToggle: () => void;
}

export default function ZenMode({ active, onToggle }: Props) {
  // Cache settings on mount — avoids localStorage parse every second
  const pom = useMemo(() => loadAppSettings().pomodoro, []);
  const FOCUS_DURATION = pom.workMinutes * 60;
  const BREAK_DURATION = pom.breakMinutes * 60;
  const LONG_BREAK_DURATION = pom.longBreakMinutes * 60;

  const [timerRunning, setTimerRunning] = useState(false);
  const [phase, setPhase] = useState<TimerPhase>("focus");
  const [seconds, setSeconds] = useState(FOCUS_DURATION);
  const [cycleCount, setCycleCount] = useState(0);
  const [noiseOn, setNoiseOn] = useState(false);
  const [noiseVolume, setNoiseVolume] = useState(0.3);
  const [ambientTrack, setAmbientTrack] = useState<AmbientTrack>("brown");
  const [pomodoroStats, setPomodoroStats] = useState<Awaited<ReturnType<typeof getPomodoroStats>>>({ today: 0, todayMinutes: 0, week: 0, weekMinutes: 0, total: 0 });

  // Load pomodoro stats on mount
  useEffect(() => { getPomodoroStats().then(setPomodoroStats); }, []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalForPhase = phase === "focus" ? FOCUS_DURATION : phase === "longBreak" ? LONG_BREAK_DURATION : BREAK_DURATION;

  useEffect(() => {
    if (active) {
      document.documentElement.requestFullscreen?.().catch((e) => console.warn("[fullscreen]", e));
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch((e) => console.warn("[fullscreen]", e));
      setTimerRunning(false);
      if (isAmbientPlaying()) { stopAmbient(); setNoiseOn(false); }
    }
  }, [active]);

  useEffect(() => {
    if (timerRunning && seconds > 0) {
      intervalRef.current = setInterval(() => setSeconds(s => s - 1), 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning, seconds]);

  const playChime = useCallback((type: "focus" | "break") => {
    try {
      const ctx = new AudioContext();
      const freqs = type === "focus" ? [523, 659, 784] : [784, 659, 523];
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.25);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.5);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.25);
        osc.stop(ctx.currentTime + i * 0.25 + 0.5);
      });
    } catch {}
  }, []);

  useEffect(() => {
    if (seconds <= 0) {
      setTimerRunning(false);
      if (phase === "focus") {
        addPomodoroEntry({ timestamp: Date.now(), type: "focus", durationMinutes: pom.workMinutes })
          .then(() => getPomodoroStats()).then(setPomodoroStats);
        playChime("focus");
        const newCycle = cycleCount + 1;
        setCycleCount(newCycle);
        if (pom.longBreakInterval > 0 && newCycle % pom.longBreakInterval === 0) {
          setPhase("longBreak");
          setSeconds(LONG_BREAK_DURATION);
        } else {
          setPhase("break");
          setSeconds(BREAK_DURATION);
        }
      } else {
        const dur = phase === "longBreak" ? pom.longBreakMinutes : pom.breakMinutes;
        void addPomodoroEntry({ timestamp: Date.now(), type: "break", durationMinutes: dur });
        playChime("break");
        setPhase("focus");
        setSeconds(FOCUS_DURATION);
      }
    }
  }, [seconds, phase, playChime, cycleCount, pom, FOCUS_DURATION, BREAK_DURATION, LONG_BREAK_DURATION]);

  const toggleNoise = useCallback(() => {
    if (noiseOn) { stopAmbient(); setNoiseOn(false); }
    else { startAmbient(ambientTrack, noiseVolume); setNoiseOn(true); }
  }, [noiseOn, noiseVolume, ambientTrack]);

  const handleTrackChange = useCallback((val: AmbientTrack) => {
    setAmbientTrack(val);
    if (noiseOn) {
      stopAmbient();
      startAmbient(val, noiseVolume);
    }
  }, [noiseOn, noiseVolume]);

  const handleVolumeChange = useCallback((val: number[]) => {
    setNoiseVolume(val[0]);
    setAmbientVolume(val[0]);
  }, []);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setPhase("focus");
    setSeconds(FOCUS_DURATION);
    setCycleCount(0);
  }, [FOCUS_DURATION]);

  const skipPhase = useCallback(() => {
    setTimerRunning(false);
    if (phase === "focus") {
      setPhase("break");
      setSeconds(BREAK_DURATION);
    } else {
      setPhase("focus");
      setSeconds(FOCUS_DURATION);
    }
  }, [phase, FOCUS_DURATION, BREAK_DURATION]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = ((totalForPhase - seconds) / totalForPhase) * 100;

  if (!active) return null;

  const phaseConfig = {
    focus: { label: "Fokus", icon: Brain, accent: "text-primary", ring: "stroke-primary", bg: "bg-primary" },
    break: { label: "Pauza", icon: Coffee, accent: "text-success", ring: "stroke-success", bg: "bg-success" },
    longBreak: { label: "Dugačka pauza", icon: Coffee, accent: "text-amber-500", ring: "stroke-amber-500", bg: "bg-amber-500" },
  }[phase];

  // Circular progress ring
  const RING_SIZE = 160;
  const STROKE_WIDTH = 5;
  const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  const strokeDashoffset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  // Cycle dots
  const interval = pom.longBreakInterval || 4;
  const currentInCycle = cycleCount % interval;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed bottom-6 right-6 z-[100]"
      role="dialog"
      aria-modal="false"
      aria-label="Zen Mode tajmer"
    >
      <div className="rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl w-[260px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2">
            <phaseConfig.icon className={cn("h-4 w-4", phaseConfig.accent)} />
            <span className={cn("text-xs font-semibold uppercase tracking-widest", phaseConfig.accent)}>
              {phaseConfig.label}
            </span>
          </div>
          <button onClick={onToggle} className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Circular Timer */}
        <div className="flex flex-col items-center py-4">
          <div className="relative" style={{ width: RING_SIZE, height: RING_SIZE }}>
            <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
              {/* Track */}
              <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
                fill="none" strokeWidth={STROKE_WIDTH}
                className="stroke-muted/40"
              />
              {/* Progress */}
              <motion.circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RADIUS}
                fill="none" strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                className={phaseConfig.ring}
                strokeDasharray={CIRCUMFERENCE}
                animate={{ strokeDashoffset }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </svg>
            {/* Time display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-3xl font-mono font-bold tabular-nums text-foreground leading-none">
                {formatTime(seconds)}
              </p>
              <span className="text-[10px] text-muted-foreground mt-1 uppercase tracking-wider">
                {phase === "focus" ? `${pom.workMinutes} min` : phase === "longBreak" ? `${pom.longBreakMinutes} min` : `${pom.breakMinutes} min`}
              </span>
            </div>
          </div>

          {/* Cycle dots */}
          {pom.longBreakInterval > 0 && (
            <div className="flex items-center gap-1.5 mt-3">
              {Array.from({ length: interval }, (_, i) => (
                <div key={i} className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  i < currentInCycle ? phaseConfig.bg : "bg-muted",
                  i === currentInCycle && phase === "focus" && timerRunning && "animate-pulse"
                )} />
              ))}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={resetTimer} title="Resetuj">
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={timerRunning ? "outline" : "default"}
            size="sm"
            className="h-8 px-5 rounded-lg gap-1.5"
            onClick={() => setTimerRunning(!timerRunning)}
          >
            {timerRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {timerRunning ? "Pauziraj" : "Pokreni"}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={skipPhase} title="Preskoči">
            <SkipForward className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Stats & Noise divider */}
        <div className="border-t border-border/50 mx-3" />

        {/* Stats row */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Timer className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 flex justify-between text-xs">
            <span className="text-muted-foreground">Danas <span className="font-semibold text-foreground">{pomodoroStats.today}</span></span>
            <span className="text-muted-foreground">Sedmica <span className="font-semibold text-foreground">{pomodoroStats.week}</span></span>
          </div>
        </div>

        {/* Brown Noise */}
        <div className="border-t border-border/50 mx-3" />
        <div className="px-4 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Ambijent šum</span>
            <button
              onClick={toggleNoise}
              className={cn(
                "p-1.5 rounded-lg transition-all duration-200",
                noiseOn ? "bg-primary/15 text-primary shadow-sm" : "hover:bg-muted text-muted-foreground"
              )}
            >
              {noiseOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
          </div>
          {noiseOn && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <Slider value={[noiseVolume]} min={0.05} max={1} step={0.05} onValueChange={handleVolumeChange} className="py-1" />
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
