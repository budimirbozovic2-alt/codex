import { Card as SRCard, SRSettings, getPendingFirstReviewCount } from "@/lib/spaced-repetition";
import { ReviewLogEntry, getStorageUsage, getLastBackupTime } from "@/lib/storage";
import { loadSlippageLog } from "@/lib/metacognitive-storage";
import { loadPlanner, calcVelocity, calcEstimatedFinish, getPlannerStatus, getSmartSuggestion, calcDailyTimeRecommendation, getCognitiveDebt, recordDayDiscipline, loadDisciplineLog, calcPhaseProgress, getDailyMappedCount, autoRedistributeIfNeeded } from "@/lib/planner-storage";
import ProgressRing from "@/components/ProgressRing";
import { calcEnergyRecommendation } from "@/lib/cognitive-analytics";
import { loadAppSettings } from "@/lib/app-settings";
import { useMemo } from "react";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";
import { startOfDay } from "date-fns";
import { motion } from "framer-motion";
import { Target, ShieldAlert, AlertTriangle, Download, HardDrive } from "lucide-react";

import { ExamProgressBar } from "./dashboard/ExamProgressBar";
import { CoreStats } from "./dashboard/CoreStats";
import { DailyBriefing } from "./dashboard/DailyBriefing";
import { IdealFocus } from "./dashboard/IdealFocus";
import { VelocityWidget } from "./dashboard/VelocityWidget";
import { StatusIconsRow, StatusIcon } from "./dashboard/StatusIconsRow";

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
  const appSettings = useMemo(() => loadAppSettings(), []);
  const wc = appSettings.dashboardWidgets;
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
  const backupOverdue = useDeferredCompute(() => {
    if (appSettings.autoBackupDays <= 0) return false;
    const last = getLastBackupTime();
    if (!last || last === 0) return false;
    return Date.now() - last > appSettings.autoBackupDays * 24 * 60 * 60 * 1000;
  }, [appSettings]);
  const lastBackup = useDeferredCompute(() => getLastBackupTime(), []);

  const plannerData = useDeferredCompute(() => {
    const planner = loadPlanner();
    if (!planner.finalGoalDate) return null;
    const velocity = calcVelocity(reviewLog, 7);
    const remaining = stats.totalSections - stats.learnedSections;
    const estimated = calcEstimatedFinish(remaining, velocity);
    const status = getPlannerStatus(estimated, planner.finalGoalDate, planner.bufferPercent ?? 15);
    const suggestion = getSmartSuggestion(null, cards, planner.finalGoalDate, velocity, planner.bufferPercent ?? 15);
    const timeRec = suggestion ? calcDailyTimeRecommendation(suggestion.suggestedToday, velocity, stats.due) : null;
    const phaseProgressList = planner.phases.map(p => ({ ...p, ...calcPhaseProgress(p, cards) }));
    const activePhase = phaseProgressList.find(p => p.pct < 100) || phaseProgressList[0] || null;
    const dailyMapped = getDailyMappedCount();
    const dailyQuota = suggestion?.suggestedToday ?? 0;
    const redistResult = autoRedistributeIfNeeded(cards, planner.finalGoalDate, planner.bufferPercent ?? 15);
    return { status, suggestion, timeRec, remaining, totalSections: stats.totalSections, learnedSections: stats.learnedSections, activePhase, dailyMapped, dailyQuota, redistResult };
  }, [stats, reviewLog, cards]);

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

  const energyLevel = getEnergyLevel();

  const velocityData = useDeferredCompute(() => {
    const velocity = calcVelocity(reviewLog, 7);
    const velocityPrev = calcVelocity(reviewLog, 14) - velocity;
    const trend = velocity > velocityPrev ? "up" : velocity < velocityPrev ? "down" : "flat";
    return { velocity: Math.round(velocity * 10) / 10, trend } as const;
  }, [reviewLog]);

  const weakestCategories = useMemo(() => {
    return categories
      .filter(cat => categoryStats[cat]?.total > 0)
      .map(cat => ({ name: cat, score: categoryStats[cat].score, total: categoryStats[cat].total }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [categories, categoryStats]);

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

  const statusIcons = useMemo<StatusIcon[]>(() => {
    const icons: StatusIcon[] = [];
    if (showMemoryWarning) {
      icons.push({ key: "memory", icon: <ShieldAlert className="h-4 w-4" />, color: "text-destructive", label: `Rizik od zagušenja memorije — potrebno ${focusRatio.targetReviewPct}% ponavljanja, stvarno ${actualRatio.actualReviewPct}%`, critical: true });
    }
    if (cognitiveDebt) {
      icons.push({ key: "debt", icon: <AlertTriangle className="h-4 w-4" />, color: "text-warning", label: cognitiveDebt.message, critical: false });
    }
    if (backupOverdue) {
      icons.push({ key: "backup", icon: <Download className="h-4 w-4" />, color: "text-warning", label: lastBackup && lastBackup > 0 ? `Backup zastarjeo — posljednji: ${new Date(lastBackup).toLocaleDateString("sr-Latn")}` : "Nikad niste napravili backup", critical: false });
    }
    if (storageUsage && storageUsage.percent > 70) {
      icons.push({ key: "storage", icon: <HardDrive className="h-4 w-4" />, color: storageUsage.percent > 90 ? "text-destructive" : "text-warning", label: `Prostor: ${storageUsage.percent}% — ${(storageUsage.usedBytes / 1024 / 1024).toFixed(1)} MB / ${(storageUsage.maxBytes / 1024 / 1024).toFixed(0)} MB`, critical: storageUsage.percent > 90 });
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
      {wc.showExamProgress && (
        <ExamProgressBar
          learnedSections={stats.learnedSections}
          totalSections={stats.totalSections}
          statusMessage={statusMessage}
          statusColor={statusColor}
        />
      )}

      {wc.showCoreStats && (
        <CoreStats
          due={stats.due}
          learnedSections={stats.learnedSections}
          totalSections={stats.totalSections}
          pendingFirstReview={pendingFirstReview}
        />
      )}

      {wc.showProgressRing && plannerData && plannerData.activePhase && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
          className="rounded-xl bg-card border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium">Progres faze: {plannerData.activePhase.name}</h3>
          </div>
          <div className="flex items-center justify-around">
            <ProgressRing
              percent={plannerData.activePhase.pct}
              label="Ukupno"
              sublabel={`${plannerData.activePhase.learned}/${plannerData.activePhase.total}`}
              colorClass="text-primary"
            />
            <ProgressRing
              percent={plannerData.dailyQuota > 0 ? Math.min(100, Math.round((plannerData.dailyMapped / plannerData.dailyQuota) * 100)) : 0}
              label="Danas"
              sublabel={`${plannerData.dailyMapped}/${plannerData.dailyQuota}`}
              colorClass={plannerData.dailyMapped >= plannerData.dailyQuota && plannerData.dailyQuota > 0 ? "text-success" : "text-warning"}
            />
          </div>
          {plannerData.redistResult?.redistributed && (
            <p className="text-xs text-warning mt-3 text-center">
              ⚡ Kvota automatski redistribuirana: {plannerData.redistResult.newQuota} sekcija/dan
            </p>
          )}
        </motion.div>
      )}

      {wc.showBriefing && (
        <DailyBriefing
          briefText={briefText}
          timeRecMessage={plannerData?.timeRec?.message ?? null}
          todayReviews={todayReviews}
          dailyGoal={dailyGoal}
          goalProgress={goalProgress}
          streak={streak}
        />
      )}

      {wc.showIdealFocus && stats.totalSections > 0 && (
        <IdealFocus
          focusRatio={focusRatio}
          actualRatio={actualRatio}
          autoSuggestion={autoSuggestion}
          dailyGoal={dailyGoal}
        />
      )}

      {(wc.showVelocity || wc.showWeakCategories) && (
        <VelocityWidget
          velocityData={velocityData}
          weakestCategories={weakestCategories}
          showVelocity={wc.showVelocity}
          showWeakCategories={wc.showWeakCategories}
        />
      )}

      {wc.showStatusIcons && (
        <StatusIconsRow icons={statusIcons} onExport={onExport} storagePercent={storageUsage?.percent} />
      )}
    </div>
  );
}
