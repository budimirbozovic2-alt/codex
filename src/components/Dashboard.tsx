import { Clock, BookOpen, AlertTriangle, Download, HardDrive, Play, Target, Hand, TrendingUp, ShieldAlert, Gauge, Lightbulb, Hourglass, Brain, Zap } from "lucide-react";
import PomodoroTimer from "@/components/PomodoroTimer";
import { motion } from "framer-motion";
import { Card, getCardRetrievability, SRSettings, DEFAULT_SR_SETTINGS, getPendingFirstReviewCount } from "@/lib/spaced-repetition";
import { ReviewLogEntry, getStorageUsage, isBackupOverdue, getLastBackupTime } from "@/lib/storage";
import { loadDiary, loadActivityLog, loadSlippageLog, getTimeDistribution } from "@/lib/metacognitive-storage";
import { loadPlanner, calcVelocity, calcEstimatedFinish, getPlannerStatus, getDailySuggestion, calcDailyTimeRecommendation, getCognitiveDebt, recordDayDiscipline, getDisciplineEmoji, getDisciplineLabel, loadDisciplineLog } from "@/lib/planner-storage";
import { calcEnergyRecommendation, calcStrategicRealityCheck } from "@/lib/cognitive-analytics";
import { useMemo, useState, useEffect } from "react";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";

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

// ─── Dynamic Focus Ratio Algorithm ──────────────────────
function calcFocusRatio(learnedSections: number, totalSections: number) {
  if (totalSections === 0) return { progress: 0, targetReviewPct: 5, targetNewPct: 95 };
  const progress = Math.round((learnedSections / totalSections) * 100);
  const targetReviewPct = Math.max(5, progress); // linear: review % = progress %
  return { progress, targetReviewPct, targetNewPct: 100 - targetReviewPct };
}

function calcActualRatio(reviewLog: ReviewLogEntry[], cards: Card[]) {
  const todayKey = getDayKey(Date.now());
  const todayEntries = reviewLog.filter(e => getDayKey(e.timestamp) === todayKey);
  if (todayEntries.length === 0) return { actualReviewPct: 0, actualNewPct: 0, totalToday: 0, reviewCount: 0, newCount: 0 };

  // A "review" entry is one where the section had been reviewed before today
  // A "new" entry is one where the section was first seen
  const sectionFirstSeen = new Map<string, number>();
  reviewLog.forEach(e => {
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
  });

  const todayStart = startOfDay(new Date()).getTime();
  let reviewCount = 0;
  let newCount = 0;
  todayEntries.forEach(e => {
    const key = `${e.cardId}:${e.sectionId}`;
    const firstSeen = sectionFirstSeen.get(key) || e.timestamp;
    if (firstSeen < todayStart) {
      reviewCount++; // section was known before today
    } else {
      newCount++; // first seen today
    }
  });

  const total = reviewCount + newCount;
  return {
    actualReviewPct: total > 0 ? Math.round((reviewCount / total) * 100) : 0,
    actualNewPct: total > 0 ? Math.round((newCount / total) * 100) : 0,
    totalToday: total,
    reviewCount,
    newCount,
  };
}

// PomodoroTimer moved to src/components/PomodoroTimer.tsx (global in MainLayout)

// ─── Custom Tooltip ──────────────────────────────────────
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium text-card-foreground">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="text-xs">
          {p.name}: <span className="font-medium">{p.value}%</span>
        </p>
      ))}
    </div>
  );
};

export default function Dashboard({ stats, categoryStats, categories, subcategories, cards, reviewLog, srSettings, onExport, onStartReview }: Props) {
  const todayKey = getDayKey(Date.now());
  const todayReviews = useMemo(() => reviewLog.filter(e => getDayKey(e.timestamp) === todayKey).length, [reviewLog, todayKey]);
  const dailyGoal = srSettings.dailyGoal;
  const goalProgress = Math.min(100, Math.round((todayReviews / Math.max(1, dailyGoal)) * 100));
  const pendingFirstReview = useMemo(() => getPendingFirstReviewCount(cards), [cards]);

  // Streak
  const streak = useMemo(() => {
    const reviewDays = new Set(reviewLog.map(e => getDayKey(e.timestamp)));
    let count = 0;
    const cursor = new Date();
    if (!reviewDays.has(getDayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
    while (reviewDays.has(getDayKey(cursor.getTime()))) { count++; cursor.setDate(cursor.getDate() - 1); }
    return count;
  }, [reviewLog]);

  // Dynamic Focus Ratio
  const focusRatio = useMemo(() => calcFocusRatio(stats.learnedSections, stats.totalSections), [stats]);
  const actualRatio = useMemo(() => calcActualRatio(reviewLog, cards), [reviewLog, cards]);

  // Memory Safety Warning
  const showMemoryWarning = useMemo(() => {
    if (actualRatio.totalToday < 5) return false; // too little data
    const deficit = focusRatio.targetReviewPct - actualRatio.actualReviewPct;
    return deficit > 20; // warning if actual review is 20%+ below target
  }, [focusRatio, actualRatio]);

  // 14-day ratio history chart (DEFERRED — heavy)
  const ratioHistory = useDeferredCompute(() => {
    const now = new Date();
    const days = eachDayOfInterval({ start: subDays(now, 13), end: now });

    const sectionFirstSeen = new Map<string, number>();
    reviewLog.forEach(e => {
      const key = `${e.cardId}:${e.sectionId}`;
      const prev = sectionFirstSeen.get(key);
      if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
    });

    return days.map(day => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 86400000;
      const dayEntries = reviewLog.filter(r => r.timestamp >= dayStart && r.timestamp < dayEnd);

      let review = 0, newL = 0;
      dayEntries.forEach(e => {
        const key = `${e.cardId}:${e.sectionId}`;
        const firstSeen = sectionFirstSeen.get(key) || e.timestamp;
        if (firstSeen < dayStart) review++; else newL++;
      });

      const total = review + newL;
      const actualReview = total > 0 ? Math.round((review / total) * 100) : null;

      return {
        name: format(day, "dd.MM"),
        "Stvarni ponavljanje": actualReview,
        "Idealni cilj": focusRatio.targetReviewPct,
      };
    });
  }, [reviewLog, focusRatio]);

  // Diary goal text (DEFERRED)
  const diaryGoal = useDeferredCompute(() => {
    const diary = loadDiary();
    const today = new Date().toISOString().slice(0, 10);
    return diary.find(d => d.date === today)?.dailyGoal || null;
  }, []);

  // Auto-calibrated suggestion
  const autoSuggestion = useMemo(() => {
    if (stats.totalSections === 0) return null;
    const reviewTarget = Math.round((focusRatio.targetReviewPct / 100) * dailyGoal);
    const newTarget = dailyGoal - reviewTarget;
    return { reviewTarget, newTarget };
  }, [focusRatio, dailyGoal, stats.totalSections]);

  const storageUsage = useDeferredCompute(() => getStorageUsage(), [cards, reviewLog]);
  const backupOverdue = useDeferredCompute(() => isBackupOverdue(), []);
  const lastBackup = useDeferredCompute(() => getLastBackupTime(), []);

  // Planner suggestion + time predictor (DEFERRED — heavy)
  const plannerData = useDeferredCompute(() => {
    const planner = loadPlanner();
    if (!planner.finalGoalDate) return null;
    const totalSections = stats.totalSections;
    const learnedSections = stats.learnedSections;
    const velocity = calcVelocity(reviewLog, 7);
    const remaining = totalSections - learnedSections;
    const estimated = calcEstimatedFinish(remaining, velocity);
    const status = getPlannerStatus(estimated, planner.finalGoalDate);
    const suggestion = getDailySuggestion(totalSections, learnedSections, planner.finalGoalDate, velocity);
    const timeRec = suggestion ? calcDailyTimeRecommendation(suggestion.suggestedToday, velocity, stats.due) : null;
    return { status, suggestion, timeRec };
  }, [stats, reviewLog]);

  const cognitiveDebt = useDeferredCompute(() => getCognitiveDebt(dailyGoal), [dailyGoal]);

  // Time distribution for today (DEFERRED)
  const todayTime = useDeferredCompute(() => getTimeDistribution(1), []);

  // Energy-Material Matcher (DEFERRED)
  const energyRec = useDeferredCompute(() => calcEnergyRecommendation(), []);

  // Strategic Reality Check (DEFERRED — heavy)
  const strategicAlert = useDeferredCompute(() => calcStrategicRealityCheck(cards, reviewLog), [cards, reviewLog]);

  // Record discipline for yesterday (if not already done)
  useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    const log = loadDisciplineLog();
    if (log.find(e => e.date === yKey)) return;
    const yStart = new Date(yKey).getTime();
    const yEnd = yStart + 86400000;
    const yReviews = reviewLog.filter(e => e.timestamp >= yStart && e.timestamp < yEnd).length;
    const slippageLog = loadSlippageLog();
    const ySlippage = slippageLog.find(s => s.date === yKey)?.slippageMs ?? null;
    recordDayDiscipline(yKey, yReviews, dailyGoal, ySlippage);
  }, [reviewLog, dailyGoal]);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <h1 className="text-5xl md:text-6xl font-serif italic tracking-tight">
          Učenje kroz<br />
          <span className="text-primary">ponavljanje</span>
        </h1>
      </motion.div>

      {/* Mental Trigger */}
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
        className="flex items-center gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
          <Hand className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium">Mentalni okidač</p>
          <p className="text-xs text-muted-foreground">Pucni prstima ili napravi gest prije nego počneš učiti — aktiviraj režim fokusa.</p>
        </div>
      </motion.div>

      {/* Energy-Material Matcher */}
      {energyRec && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.22 }}
          className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <Brain className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-warning">Prilagođen režim učenja</p>
            <p className="text-xs text-muted-foreground mt-1">{energyRec.message}</p>
            {energyRec.suggestMnemonics && (
              <p className="text-xs text-primary mt-1">💡 Preporuka: otvori Memorizaciju za lagani dril kuka.</p>
            )}
          </div>
        </motion.div>
      )}

      {/* Strategic Reality Check */}
      {strategicAlert && strategicAlert.type === "ambitious" && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.24 }}
          className="flex items-start gap-3 p-4 rounded-xl border border-primary/30 bg-primary/5">
          <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Plan je previše ambiciozan</p>
            <p className="text-xs text-muted-foreground mt-1">{strategicAlert.message}</p>
          </div>
        </motion.div>
      )}

      {/* Core Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl bg-card border p-5 space-y-2">
          <Clock className="h-5 w-5 text-primary mb-1" />
          <p className="text-4xl font-serif">{stats.due}</p>
          <p className="text-sm text-muted-foreground">Za ponavljanje</p>
          {pendingFirstReview > 0 && <p className="text-xs text-primary">+ {pendingFirstReview} čeka prvo pon.</p>}
          {onStartReview && stats.due > 0 && (
            <Button size="sm" onClick={onStartReview} className="mt-2 gap-1.5 w-full">
              <Play className="h-3.5 w-3.5" /> Ponavljaj
            </Button>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-xl bg-card border p-5 space-y-2">
          <BookOpen className="h-5 w-5 text-success mb-1" />
          <p className="text-4xl font-serif">{stats.learnedSections}</p>
          <p className="text-sm text-muted-foreground">Naučene cjeline</p>
          <p className="text-xs text-muted-foreground">od {stats.totalSections} ukupno</p>
        </motion.div>
      </div>

      {/* Ideal Focus Today */}
      {stats.totalSections > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">Idealni fokus danas</h3>
            </div>
            <span className="text-xs text-muted-foreground">Progres: {focusRatio.progress}%</span>
          </div>

          {/* Dual progress bar */}
          <div className="space-y-2">
            <div className="flex h-6 rounded-lg overflow-hidden bg-secondary">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${focusRatio.targetReviewPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="bg-primary flex items-center justify-center"
              >
                {focusRatio.targetReviewPct >= 15 && (
                  <span className="text-[10px] font-bold text-primary-foreground">Ponavljanje {focusRatio.targetReviewPct}%</span>
                )}
              </motion.div>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${focusRatio.targetNewPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                className="bg-success flex items-center justify-center"
              >
                {focusRatio.targetNewPct >= 15 && (
                  <span className="text-[10px] font-bold text-success-foreground">Novo {focusRatio.targetNewPct}%</span>
                )}
              </motion.div>
            </div>

            {/* Actual ratio comparison */}
            {actualRatio.totalToday > 0 && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Stvarni omjer danas</span>
                  <span className="tabular-nums">{actualRatio.reviewCount} pon. / {actualRatio.newCount} novo</span>
                </div>
                <div className="flex h-3 rounded-md overflow-hidden bg-secondary">
                  <div className="bg-primary/60 transition-all" style={{ width: `${actualRatio.actualReviewPct}%` }} />
                  <div className="bg-success/60 transition-all" style={{ width: `${actualRatio.actualNewPct}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Auto-suggestion */}
          {autoSuggestion && (
            <p className="text-xs text-muted-foreground">
              💡 Preporučeni cilj: <span className="font-medium text-foreground">{autoSuggestion.reviewTarget}</span> ponavljanja + <span className="font-medium text-foreground">{autoSuggestion.newTarget}</span> novih od ukupno {dailyGoal}.
            </p>
          )}
        </motion.div>
      )}

      {/* Memory Safety Warning */}
      {showMemoryWarning && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <ShieldAlert className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-destructive">Rizik od zagušenja memorije</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tvoj progres ({focusRatio.progress}%) zahtijeva ~{focusRatio.targetReviewPct}% fokusa na ponavljanje, ali danas je samo {actualRatio.actualReviewPct}% usmjereno na to.
              Povećaj ponavljanje kako bi zadržao naučeno.
            </p>
          </div>
        </motion.div>
      )}

      {/* Daily Goal Progress */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="rounded-xl bg-card border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Dnevni cilj</h3>
          </div>
          <div className="flex items-center gap-3">
            {streak > 0 && (
              <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.5 }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
                <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="text-sm">🔥</motion.span>
                <span className="text-xs font-bold text-warning tabular-nums">{streak} {streak === 1 ? "dan" : "dana"}</span>
              </motion.div>
            )}
            <span className="text-sm font-medium tabular-nums">{todayReviews} / {dailyGoal}</span>
          </div>
        </div>
        <Progress value={goalProgress} className="h-2.5" />
        {goalProgress >= 100 && <p className="text-xs text-success font-medium">✓ Cilj ostvaren! 🎉</p>}
        {diaryGoal && (
          <div className="pt-1 border-t">
            <p className="text-xs text-muted-foreground">📝 {diaryGoal}</p>
          </div>
        )}
      </motion.div>

      {/* Effective Learning Today Widget */}
      {todayTime && todayTime.totalMs > 60000 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
          className="rounded-xl bg-card border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">Efektivno učenje danas</h3>
            </div>
            <span className="text-lg font-serif text-primary tabular-nums">
              {Math.floor(todayTime.cognitiveMs / 3600000) > 0
                ? `${Math.floor(todayTime.cognitiveMs / 3600000)}h ${Math.round((todayTime.cognitiveMs % 3600000) / 60000)}min`
                : `${Math.round(todayTime.cognitiveMs / 60000)} min`}
            </span>
          </div>
          <div className="flex h-3 rounded-md overflow-hidden bg-secondary">
            {todayTime.review > 0 && <div className="bg-primary transition-all" style={{ width: `${(todayTime.review / todayTime.totalMs) * 100}%` }} title="Ponavljanje" />}
            {todayTime.learning > 0 && <div className="bg-success transition-all" style={{ width: `${(todayTime.learning / todayTime.totalMs) * 100}%` }} title="Učenje" />}
            {todayTime.creative > 0 && <div className="bg-warning transition-all" style={{ width: `${(todayTime.creative / todayTime.totalMs) * 100}%` }} title="Kreativ/Admin" />}
            {todayTime.analysis > 0 && <div className="bg-muted-foreground/30 transition-all" style={{ width: `${(todayTime.analysis / todayTime.totalMs) * 100}%` }} title="Analiza" />}
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" /> Ponavljanje {Math.round(todayTime.review / 60000)}m</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> Učenje {Math.round(todayTime.learning / 60000)}m</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /> Admin {Math.round(todayTime.creative / 60000)}m</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/30" /> Analiza {Math.round(todayTime.analysis / 60000)}m</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Neto kognitivni rad: {todayTime.cognitivePct}% • Logistika: {100 - todayTime.cognitivePct}%
          </p>
        </motion.div>
      )}

      {/* Actual vs Ideal Ratio Chart (14 days) */}
      {ratioHistory.some(d => d["Stvarni ponavljanje"] !== null) && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h3 className="font-serif text-lg">Omjer ponavljanja (14 dana)</h3>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={ratioHistory}>
                <defs>
                  <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} domain={[0, 100]} unit="%" />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine y={focusRatio.targetReviewPct} stroke="hsl(var(--destructive))" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Cilj ${focusRatio.targetReviewPct}%`, position: "right", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                <Area type="monotone" dataKey="Stvarni ponavljanje" stroke="hsl(var(--primary))" fill="url(#gradActual)" strokeWidth={2} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 justify-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3 h-1 rounded-full bg-primary" /> Stvarni % ponavljanja</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-destructive" style={{ borderTop: "2px dashed" }} /> Idealni cilj</span>
          </div>
        </motion.div>
      )}

      {/* Cognitive Debt Warning */}
      {cognitiveDebt && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-warning">Kognitivni dug</p>
            <p className="text-xs text-muted-foreground mt-0.5">{cognitiveDebt.message}</p>
          </div>
        </motion.div>
      )}

      {/* Daily Time Predictor + Planner Suggestion */}
      {plannerData && plannerData.suggestion && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
          className="rounded-xl bg-card border p-5 space-y-3">
          {/* Time recommendation */}
          {plannerData.timeRec && (
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Hourglass className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Preporuka za danas</p>
                <p className="text-lg font-serif text-primary">{plannerData.timeRec.message}</p>
              </div>
            </div>
          )}

          {/* Suggestion */}
          <div className={`flex items-start gap-3 p-3 rounded-lg ${
            plannerData.status.status === "green" ? "bg-success/5" :
            plannerData.status.status === "yellow" ? "bg-warning/5" :
            plannerData.status.status === "red" ? "bg-destructive/5" :
            "bg-primary/5"
          }`}>
            <Lightbulb className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
              plannerData.status.status === "green" ? "text-success" :
              plannerData.status.status === "yellow" ? "text-warning" :
              plannerData.status.status === "red" ? "text-destructive" : "text-primary"
            }`} />
            <p className="text-xs text-muted-foreground">{plannerData.suggestion.message}</p>
          </div>
        </motion.div>
      )}

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
    </div>
  );
}
