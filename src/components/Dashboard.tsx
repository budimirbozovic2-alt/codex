import { default as Clock } from "lucide-react/dist/esm/icons/clock";
import { default as BookOpen } from "lucide-react/dist/esm/icons/book-open";
import { default as AlertTriangle } from "lucide-react/dist/esm/icons/alert-triangle";
import { default as Download } from "lucide-react/dist/esm/icons/download";
import { default as HardDrive } from "lucide-react/dist/esm/icons/hard-drive";
import { default as Target } from "lucide-react/dist/esm/icons/target";
import { default as ShieldAlert } from "lucide-react/dist/esm/icons/shield-alert";
import { default as Gauge } from "lucide-react/dist/esm/icons/gauge";
import { default as Lightbulb } from "lucide-react/dist/esm/icons/lightbulb";
import { default as Brain } from "lucide-react/dist/esm/icons/brain";
import { default as Trophy } from "lucide-react/dist/esm/icons/trophy";
import { default as TrendingUp } from "lucide-react/dist/esm/icons/trending-up";
import { default as BarChart3 } from "lucide-react/dist/esm/icons/bar-chart-3";
import { motion } from "framer-motion";
import { Card as SRCard, SRSettings, getPendingFirstReviewCount } from "@/lib/spaced-repetition";
import { ReviewLogEntry, getStorageUsage, isBackupOverdue, getLastBackupTime } from "@/lib/storage";
import { loadDiary, loadSlippageLog } from "@/lib/metacognitive-storage";
import { loadPlanner, calcVelocity, calcEstimatedFinish, getPlannerStatus, getSmartSuggestion, calcDailyTimeRecommendation, getCognitiveDebt, recordDayDiscipline, loadDisciplineLog } from "@/lib/planner-storage";
import { calcEnergyRecommendation } from "@/lib/cognitive-analytics";
import { useMemo } from "react";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";
import { Progress } from "@/components/ui/progress";
import { startOfDay } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  stats: { due: number; total: number; totalSections: number; learnedSections: number };
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  categories: string[];
  subcategories: Record<string, string[]>;
  cards: SRCard[];
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
  onExport?: () => void;
  onShowKnowledgeMap?: () => void;
}

function getDayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function calcFocusRatio(learnedSections: number, totalSections: number) {
  if (totalSections === 0) return { progress: 0, targetReviewPct: 5, targetNewPct: 95 };
  const progress = Math.round((learnedSections / totalSections) * 100);
  const targetReviewPct = Math.max(5, progress);
  return { progress, targetReviewPct, targetNewPct: 100 - targetReviewPct };
}

function calcActualRatio(reviewLog: ReviewLogEntry[], _cards: SRCard[]) {
  const todayStart = startOfDay(new Date()).getTime();
  const sectionFirstSeen = new Map<string, number>();
  const todayKeys: string[] = [];
  for (let i = 0; i < reviewLog.length; i++) {
    const e = reviewLog[i];
    const key = `${e.cardId}:${e.sectionId}`;
    const prev = sectionFirstSeen.get(key);
    if (!prev || e.timestamp < prev) sectionFirstSeen.set(key, e.timestamp);
    if (e.timestamp >= todayStart) todayKeys.push(key);
  }
  if (todayKeys.length === 0) return { actualReviewPct: 0, actualNewPct: 0, totalToday: 0, reviewCount: 0, newCount: 0 };
  let reviewCount = 0;
  let newCount = 0;
  for (const key of todayKeys) {
    const firstSeen = sectionFirstSeen.get(key)!;
    if (firstSeen < todayStart) reviewCount++;
    else newCount++;
  }
  const total = reviewCount + newCount;
  return {
    actualReviewPct: total > 0 ? Math.round((reviewCount / total) * 100) : 0,
    actualNewPct: total > 0 ? Math.round((newCount / total) * 100) : 0,
    totalToday: total,
    reviewCount,
    newCount,
  };
}

function getEnergyLevel(): "high" | "moderate" | "low" {
  const hour = new Date().getHours();
  if (hour >= 8 && hour < 12) return "high";
  if (hour >= 14 && hour < 18) return "moderate";
  return "low";
}

function getEnergyLabel(level: "high" | "moderate" | "low"): string {
  switch (level) {
    case "high": return "Visok";
    case "moderate": return "Umjeren";
    case "low": return "Nizak";
  }
}

export default function Dashboard({ stats, categoryStats, categories, subcategories, cards, reviewLog, srSettings, onExport }: Props) {
  const todayKey = getDayKey(Date.now());
  const todayReviews = useMemo(() => reviewLog.filter(e => getDayKey(e.timestamp) === todayKey).length, [reviewLog, todayKey]);
  const dailyGoal = srSettings.dailyGoal;
  const goalProgress = Math.min(100, Math.round((todayReviews / Math.max(1, dailyGoal)) * 100));
  const pendingFirstReview = useMemo(() => getPendingFirstReviewCount(cards), [cards]);

  const streak = useMemo(() => {
    const reviewDays = new Set(reviewLog.map(e => getDayKey(e.timestamp)));
    let count = 0;
    const cursor = new Date();
    if (!reviewDays.has(getDayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
    while (reviewDays.has(getDayKey(cursor.getTime()))) { count++; cursor.setDate(cursor.getDate() - 1); }
    return count;
  }, [reviewLog]);

  const focusRatio = useMemo(() => calcFocusRatio(stats.learnedSections, stats.totalSections), [stats]);
  const actualRatio = useMemo(() => calcActualRatio(reviewLog, cards), [reviewLog, cards]);

  const showMemoryWarning = useMemo(() => {
    if (actualRatio.totalToday < 5) return false;
    const deficit = focusRatio.targetReviewPct - actualRatio.actualReviewPct;
    return deficit > 20;
  }, [focusRatio, actualRatio]);

  const autoSuggestion = useMemo(() => {
    if (stats.totalSections === 0) return null;
    const reviewTarget = Math.round((focusRatio.targetReviewPct / 100) * dailyGoal);
    const newTarget = dailyGoal - reviewTarget;
    return { reviewTarget, newTarget };
  }, [focusRatio, dailyGoal, stats.totalSections]);

  const storageUsage = useDeferredCompute(() => getStorageUsage(), [cards, reviewLog]);
  const backupOverdue = useDeferredCompute(() => isBackupOverdue(), []);
  const lastBackup = useDeferredCompute(() => getLastBackupTime(), []);

  const plannerData = useDeferredCompute(() => {
    const planner = loadPlanner();
    if (!planner.finalGoalDate) return null;
    const totalSections = stats.totalSections;
    const learnedSections = stats.learnedSections;
    const velocity = calcVelocity(reviewLog, 7);
    const remaining = totalSections - learnedSections;
    const estimated = calcEstimatedFinish(remaining, velocity);
    const status = getPlannerStatus(estimated, planner.finalGoalDate, planner.bufferPercent ?? 15);
    const suggestion = getSmartSuggestion(null, cards, planner.finalGoalDate, velocity, planner.bufferPercent ?? 15);
    const timeRec = suggestion ? calcDailyTimeRecommendation(suggestion.suggestedToday, velocity, stats.due) : null;
    return { status, suggestion, timeRec, remaining, totalSections, learnedSections };
  }, [stats, reviewLog]);

  const cognitiveDebt = useDeferredCompute(() => getCognitiveDebt(dailyGoal), [dailyGoal]);

  const energyRec = useDeferredCompute(() => calcEnergyRecommendation(), []);

  // Record discipline for yesterday
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

  const examProgressPct = stats.totalSections > 0 ? Math.round((stats.learnedSections / stats.totalSections) * 100) : 0;
  const energyLevel = getEnergyLevel();

  // Build brief text
  const briefText = useMemo(() => {
    const parts: string[] = [];
    if (plannerData?.suggestion) {
      parts.push(`Danas fokus na ${plannerData.suggestion.suggestedToday} novih sekcija.`);
    } else if (autoSuggestion) {
      parts.push(`Cilj: ${autoSuggestion.reviewTarget} ponavljanja + ${autoSuggestion.newTarget} novih.`);
    }
    parts.push(`Kognitivni kapacitet: ${getEnergyLabel(energyLevel)}.`);
    if (energyRec?.suggestMnemonics) {
      parts.push("💡 Preporuka: lagani dril kuka.");
    }
    return parts.join(" ");
  }, [plannerData, autoSuggestion, energyLevel, energyRec]);

  // Status icons data
  const statusIcons = useMemo(() => {
    const icons: { key: string; icon: React.ReactNode; color: string; label: string; critical: boolean }[] = [];

    if (showMemoryWarning) {
      icons.push({
        key: "memory",
        icon: <ShieldAlert className="h-4 w-4" />,
        color: "text-destructive",
        label: `Rizik od zagušenja memorije — potrebno ${focusRatio.targetReviewPct}% ponavljanja, stvarno ${actualRatio.actualReviewPct}%`,
        critical: true,
      });
    }

    if (cognitiveDebt) {
      icons.push({
        key: "debt",
        icon: <AlertTriangle className="h-4 w-4" />,
        color: "text-warning",
        label: cognitiveDebt.message,
        critical: false,
      });
    }

    if (backupOverdue) {
      icons.push({
        key: "backup",
        icon: <Download className="h-4 w-4" />,
        color: "text-warning",
        label: lastBackup && lastBackup > 0
          ? `Backup zastarjeo — posljednji: ${new Date(lastBackup).toLocaleDateString("sr-Latn")}`
          : "Nikad niste napravili backup",
        critical: false,
      });
    }

    if (storageUsage && storageUsage.percent > 70) {
      icons.push({
        key: "storage",
        icon: <HardDrive className="h-4 w-4" />,
        color: storageUsage.percent > 90 ? "text-destructive" : "text-warning",
        label: `Prostor: ${storageUsage.percent}% — ${(storageUsage.usedBytes / 1024 / 1024).toFixed(1)} MB / ${(storageUsage.maxBytes / 1024 / 1024).toFixed(0)} MB`,
        critical: storageUsage.percent > 90,
      });
    }

    return icons;
  }, [showMemoryWarning, cognitiveDebt, backupOverdue, storageUsage, lastBackup, focusRatio, actualRatio]);

  const statusColor = plannerData?.status.status === "green" ? "text-success" :
    plannerData?.status.status === "yellow" ? "text-warning" :
    plannerData?.status.status === "red" ? "text-destructive" : "text-muted-foreground";

  const statusMessage = plannerData ? (
    plannerData.status.status === "green" ? "Stižeš na vrijeme ✓" :
    plannerData.status.status === "yellow" ? `Kasniš ${plannerData.status.daysLate} dana` :
    plannerData.status.status === "red" ? `Kasniš ${plannerData.status.daysLate} dana ⚠` :
    null
  ) : null;

  return (
    <div className="space-y-6">
      {/* 1. Exam Progress Bar */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-xl bg-card border p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Napredak do cilja</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium tabular-nums">{stats.learnedSections} / {stats.totalSections}</span>
            {statusMessage && (
              <span className={`text-xs font-medium ${statusColor}`}>{statusMessage}</span>
            )}
          </div>
        </div>
        <Progress value={examProgressPct} className="h-3" />
        <p className="text-xs text-muted-foreground tabular-nums">{examProgressPct}% savladano</p>
      </motion.div>

      {/* 2. Core Stats — dva brojača bez dugmadi */}
      <div className="grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-xl bg-card border p-5 space-y-2">
          <Clock className="h-5 w-5 text-primary mb-1" />
          <p className="text-4xl font-serif">{stats.due}</p>
          <p className="text-sm text-muted-foreground">Za ponavljanje</p>
          {pendingFirstReview > 0 && <p className="text-xs text-primary">+ {pendingFirstReview} čeka prvo pon.</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="rounded-xl bg-card border p-5 space-y-2">
          <BookOpen className="h-5 w-5 text-success mb-1" />
          <p className="text-4xl font-serif">{stats.learnedSections}</p>
          <p className="text-sm text-muted-foreground">Naučene cjeline</p>
          <p className="text-xs text-muted-foreground">od {stats.totalSections} ukupno</p>
        </motion.div>
      </div>

      {/* 3. Dnevni Briefing (Insight Box) */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-xl bg-card border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Dnevni briefing</h3>
        </div>

        {/* Brief text */}
        <p className="text-sm text-muted-foreground">{briefText}</p>

        {/* Planner time recommendation */}
        {plannerData?.timeRec && (
          <div className="flex items-center gap-2 text-xs">
            <Lightbulb className="h-3.5 w-3.5 text-primary" />
            <span className="text-primary font-medium">{plannerData.timeRec.message}</span>
          </div>
        )}

        {/* Daily goal progress + streak */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Dnevni cilj</span>
            </div>
            <div className="flex items-center gap-3">
              {streak > 0 && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 border border-warning/20">
                  <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 2 }} className="text-xs">🔥</motion.span>
                  <span className="text-[10px] font-bold text-warning tabular-nums">{streak}d</span>
                </motion.div>
              )}
              <span className="text-xs font-medium tabular-nums">{todayReviews} / {dailyGoal}</span>
            </div>
          </div>
          <Progress value={goalProgress} className="h-2" />
          {goalProgress >= 100 && <p className="text-xs text-success font-medium">✓ Cilj ostvaren! 🎉</p>}
        </div>
      </motion.div>

      {/* 4. Idealni Fokus */}
      {stats.totalSections > 0 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
          className="rounded-xl bg-card border p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">Idealni fokus danas</h3>
            </div>
            <span className="text-xs text-muted-foreground">Progres: {focusRatio.progress}%</span>
          </div>

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

          {autoSuggestion && (
            <p className="text-xs text-muted-foreground">
              💡 Preporučeni cilj: <span className="font-medium text-foreground">{autoSuggestion.reviewTarget}</span> ponavljanja + <span className="font-medium text-foreground">{autoSuggestion.newTarget}</span> novih od ukupno {dailyGoal}.
            </p>
          )}
        </motion.div>
      )}

      {/* 5. Status Icons Row */}
      {statusIcons.length > 0 && (
        <TooltipProvider delayDuration={200}>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34 }}
            className="flex items-center gap-2 flex-wrap">
            {statusIcons.map(si => (
              <Tooltip key={si.key}>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-card cursor-default ${si.color}`}>
                    {si.icon}
                    {si.critical && <span className="text-xs font-medium">{si.key === "memory" ? "Memorija" : si.key === "storage" ? `${storageUsage?.percent}%` : ""}</span>}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">{si.label}</p>
                  {si.key === "backup" && onExport && (
                    <button onClick={onExport} className="mt-1 text-xs text-primary underline">Napravi backup</button>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
          </motion.div>
        </TooltipProvider>
      )}
    </div>
  );
}
