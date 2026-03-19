import { Clock, BookOpen, AlertTriangle, Download, HardDrive, Timer, Play, Target, Hand } from "lucide-react";
import { motion } from "framer-motion";
import { Card, getCardRetrievability, SRSettings, DEFAULT_SR_SETTINGS, getPendingFirstReviewCount } from "@/lib/spaced-repetition";
import { ReviewLogEntry, getStorageUsage, isBackupOverdue, getLastBackupTime, getPomodoroStats } from "@/lib/storage";
import { loadDiary } from "@/lib/metacognitive-storage";
import { useMemo, useState, useEffect, useRef } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface Props {
  stats: { due: number; total: number; totalSections: number; learnedSections: number };
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  categories: string[];
  subcategories: Record<string, string[]>;
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  onExport?: () => void;
  onShowKnowledgeMap?: () => void;
  onStartReview?: () => void;
}

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Pomodoro Timer ──────────────────────────────────────
function PomodoroTimer() {
  const [mode, setMode] = useState<"work" | "break">("work");
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = window.setInterval(() => {
        setSeconds(prev => {
          if (prev <= 1) {
            setRunning(false);
            // Auto-switch mode
            if (mode === "work") {
              setMode("break");
              return 5 * 60;
            } else {
              setMode("work");
              return 25 * 60;
            }
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const progress = mode === "work"
    ? ((25 * 60 - seconds) / (25 * 60)) * 100
    : ((5 * 60 - seconds) / (5 * 60)) * 100;

  const reset = () => {
    setRunning(false);
    setSeconds(mode === "work" ? 25 * 60 : 5 * 60);
  };

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
        <p className="text-4xl font-serif tabular-nums">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </p>
      </div>
      <Progress value={progress} className="h-1.5" />
      <div className="flex gap-2 justify-center">
        <Button
          variant={running ? "outline" : "default"}
          size="sm"
          onClick={() => setRunning(!running)}
          className="gap-1.5"
        >
          {running ? "Pauziraj" : <><Play className="h-3.5 w-3.5" /> Pokreni</>}
        </Button>
        <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
      </div>
    </div>
  );
}

export default function Dashboard({ stats, categoryStats, categories, subcategories, cards, reviewLog, srSettings, onExport, onShowKnowledgeMap, onStartReview }: Props) {
  const todayKey = getDayKey(Date.now());
  const todayReviews = useMemo(() => reviewLog.filter(e => getDayKey(e.timestamp) === todayKey).length, [reviewLog, todayKey]);
  const dailyGoal = srSettings.dailyGoal;
  const goalProgress = Math.min(100, Math.round((todayReviews / Math.max(1, dailyGoal)) * 100));
  const pendingFirstReview = useMemo(() => getPendingFirstReviewCount(cards), [cards]);

  // Today's diary goal text
  const diaryGoal = useMemo(() => {
    const diary = loadDiary();
    const today = new Date().toISOString().slice(0, 10);
    const entry = diary.find(d => d.date === today);
    return entry?.dailyGoal || null;
  }, []);

  const storageUsage = useMemo(() => getStorageUsage(), [cards, reviewLog]);
  const backupOverdue = useMemo(() => isBackupOverdue(), []);
  const lastBackup = useMemo(() => getLastBackupTime(), []);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight">
          Učenje kroz<br />
          <span className="text-primary">ponavljanje</span>
        </h1>
      </motion.div>

      {/* Mental Trigger Reminder */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5"
      >
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
          <Hand className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Mentalni okidač</p>
          <p className="text-xs text-muted-foreground">Pucni prstima ili napravi gest prije nego počneš učiti — aktiviraj režim fokusa.</p>
        </div>
      </motion.div>

      {/* Core Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Daily Deck */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-xl bg-card border p-5 space-y-2"
        >
          <Clock className="h-5 w-5 text-primary mb-1" />
          <p className="text-4xl font-serif">{stats.due}</p>
          <p className="text-sm text-muted-foreground">Za ponavljanje</p>
          {pendingFirstReview > 0 && (
            <p className="text-xs text-primary">+ {pendingFirstReview} čeka prvo pon.</p>
          )}
          {onStartReview && stats.due > 0 && (
            <Button size="sm" onClick={onStartReview} className="mt-2 gap-1.5 w-full">
              <Play className="h-3.5 w-3.5" /> Ponavljaj
            </Button>
          )}
        </motion.div>

        {/* Mastery Count */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl bg-card border p-5 space-y-2"
        >
          <BookOpen className="h-5 w-5 text-success mb-1" />
          <p className="text-4xl font-serif">{stats.learnedSections}</p>
          <p className="text-sm text-muted-foreground">Naučene cjeline</p>
          <p className="text-xs text-muted-foreground">od {stats.totalSections} ukupno</p>
        </motion.div>
      </div>

      {/* Daily Goal Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl bg-card border p-5 space-y-3"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Dnevni cilj</h3>
          </div>
          <span className="text-sm font-medium tabular-nums">{todayReviews} / {dailyGoal}</span>
        </div>
        <Progress value={goalProgress} className="h-2.5" />
        {goalProgress >= 100 && (
          <p className="text-xs text-success font-medium">✓ Cilj ostvaren! 🎉</p>
        )}
        {diaryGoal && (
          <div className="pt-1 border-t">
            <p className="text-xs text-muted-foreground">📝 {diaryGoal}</p>
          </div>
        )}
      </motion.div>

      {/* Pomodoro Timer */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <PomodoroTimer />
      </motion.div>

      {/* Backup / Storage Warnings */}
      {(backupOverdue || storageUsage.percent > 70) && (
        <div className="space-y-3">
          {backupOverdue && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Vrijeme je za backup</p>
                <p className="text-xs text-muted-foreground">
                  {lastBackup > 0 ? `Posljednji backup: ${new Date(lastBackup).toLocaleDateString("sr-Latn")}` : "Nikad niste napravili backup."}
                  {" "}Podaci su samo u ovom pretraživaču.
                </p>
              </div>
              {onExport && (
                <button onClick={onExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90 transition-opacity">
                  <Download className="h-3.5 w-3.5" /> Izvezi
                </button>
              )}
            </motion.div>
          )}
          {storageUsage.percent > 70 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex items-center gap-3 p-4 rounded-xl border ${storageUsage.percent > 90 ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5"}`}>
              <HardDrive className={`h-5 w-5 flex-shrink-0 ${storageUsage.percent > 90 ? "text-destructive" : "text-warning"}`} />
              <div className="flex-1">
                <p className="text-sm font-medium">Prostor za podatke: {storageUsage.percent}%</p>
                <p className="text-xs text-muted-foreground">
                  {(storageUsage.usedBytes / 1024 / 1024).toFixed(1)} MB / {(storageUsage.maxBytes / 1024 / 1024).toFixed(0)} MB iskorišteno
                </p>
              </div>
              <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
                <div className={`h-full rounded-full transition-all ${storageUsage.percent > 90 ? "bg-destructive" : "bg-warning"}`} style={{ width: `${storageUsage.percent}%` }} />
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Half-and-Half Warning */}
      {stats.due > 50 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium">Pola-Pola strategija</p>
            <p className="text-xs text-muted-foreground">Imate {stats.due} dospjelih pitanja. Prioritetno očistite backlog prije učenja novog materijala.</p>
          </div>
        </motion.div>
      )}
    </div>
  );
}
