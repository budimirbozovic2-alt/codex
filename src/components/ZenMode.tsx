import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, Volume2, VolumeX, RotateCcw, Maximize, Minimize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { startBrownNoise, stopBrownNoise, setBrownNoiseVolume, isBrownNoisePlaying } from "@/lib/brown-noise";

type TimerPhase = "focus" | "break";

interface Props {
  active: boolean;
  onToggle: () => void;
}

export default function ZenMode({ active, onToggle }: Props) {
  const [timerRunning, setTimerRunning] = useState(false);
  const [phase, setPhase] = useState<TimerPhase>("focus");
  const [seconds, setSeconds] = useState(25 * 60);
  const [noiseOn, setNoiseOn] = useState(false);
  const [noiseVolume, setNoiseVolume] = useState(0.3);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const FOCUS_DURATION = 25 * 60;
  const BREAK_DURATION = 5 * 60;

  // Fullscreen toggle
  useEffect(() => {
    if (active) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      // Cleanup
      setTimerRunning(false);
      if (isBrownNoisePlaying()) {
        stopBrownNoise();
        setNoiseOn(false);
      }
    }
  }, [active]);

  // Timer logic
  useEffect(() => {
    if (timerRunning && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s - 1);
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, seconds]);

  // Play a chime notification using Web Audio API
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

  // Phase switch when timer reaches 0
  useEffect(() => {
    if (seconds <= 0) {
      setTimerRunning(false);
      if (phase === "focus") {
        playChime("focus");
        setPhase("break");
        setSeconds(BREAK_DURATION);
      } else {
        playChime("break");
        setPhase("focus");
        setSeconds(FOCUS_DURATION);
      }
    }
  }, [seconds, phase, playChime]);

  const toggleNoise = useCallback(() => {
    if (noiseOn) {
      stopBrownNoise();
      setNoiseOn(false);
    } else {
      startBrownNoise(noiseVolume);
      setNoiseOn(true);
    }
  }, [noiseOn, noiseVolume]);

  const handleVolumeChange = useCallback((val: number[]) => {
    const v = val[0];
    setNoiseVolume(v);
    setBrownNoiseVolume(v);
  }, []);

  const resetTimer = useCallback(() => {
    setTimerRunning(false);
    setPhase("focus");
    setSeconds(FOCUS_DURATION);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const progress = phase === "focus"
    ? ((FOCUS_DURATION - seconds) / FOCUS_DURATION) * 100
    : ((BREAK_DURATION - seconds) / BREAK_DURATION) * 100;

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed bottom-6 right-6 z-[100]"
    >
      <div className="rounded-2xl border bg-card/95 backdrop-blur-md shadow-2xl p-4 w-[240px] space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {phase === "focus" ? "🧘 Fokus" : "☕ Pauza"}
          </span>
          <button
            onClick={onToggle}
            className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Timer */}
        <div className="text-center">
          <div className="relative w-full h-1.5 rounded-full bg-secondary overflow-hidden mb-2">
            <motion.div
              className={`h-full rounded-full ${phase === "focus" ? "bg-primary" : "bg-success"}`}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-3xl font-mono font-bold tabular-nums text-foreground">
            {formatTime(seconds)}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={resetTimer}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={timerRunning ? "outline" : "default"}
            size="sm"
            className="h-8 px-4"
            onClick={() => setTimerRunning(!timerRunning)}
          >
            {timerRunning ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
            {timerRunning ? "Pauziraj" : "Pokreni"}
          </Button>
        </div>

        {/* Brown Noise */}
        <div className="space-y-1.5 pt-1 border-t">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Ambijent</span>
            <button
              onClick={toggleNoise}
              className={`p-1.5 rounded-md transition-colors ${noiseOn ? "bg-primary/10 text-primary" : "hover:bg-secondary text-muted-foreground"}`}
            >
              {noiseOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
          </div>
          {noiseOn && (
            <Slider
              value={[noiseVolume]}
              min={0.05}
              max={1}
              step={0.05}
              onValueChange={handleVolumeChange}
              className="py-1"
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
