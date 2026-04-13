import { ShieldAlert, AlertTriangle, Download, HardDrive } from "lucide-react";
import { useMemo, useEffect, useRef, useState } from "react";
import { Card as SRCard, SRSettings, getPendingFirstReviewCount } from "@/lib/spaced-repetition";
import { ReviewLogEntry, getStorageUsage, getLastBackupTime } from "@/lib/storage";
import { loadSlippageLog } from "@/lib/metacognitive-storage";
import {
  loadPlanner, calcVelocity, calcEstimatedFinish, getPlannerStatus,
  getSmartSuggestion, calcDailyTimeRecommendation, getCognitiveDebt,
  recordDayDiscipline, loadDisciplineLog,
  getDailyMappedCount, autoRedistributeIfNeeded,
  generateStudyPlan, calcLearningReviewRatio,
} from "@/lib/planner-storage";
import { CategoryRecord } from "@/lib/db";
import { StudyFlowData } from "@/components/dashboard/StudyFlowWidget";
import { calcEnergyRecommendation } from "@/lib/cognitive-analytics";
import { loadAppSettings } from "@/lib/app-settings";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";
import { startOfDay } from "date-fns";
import { StatusIcon } from "@/components/dashboard/StatusIconsRow";
import { createElement } from "react";

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

interface DashboardStats {
  due: number;
  total: number;
  totalSections: number;
  learnedSections: number;
}

export function useDashboardData(
  stats: DashboardStats,
  categoryStats: Record<string, { score: number; total: number; due: number }>,
  categories: string[],
  categoryRecords: CategoryRecord[],
  cards: SRCard[],
  reviewLog: ReviewLogEntry[],
  srSettings: SRSettings,
) {
  // Listen for settings changes from other tabs/components
  const [settingsVersion, forceSettingsRefresh] = useState(0);
  useEffect(() => {
    const handler = () => forceSettingsRefresh((n) => n + 1);
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  const appSettings = useMemo(() => loadAppSettings(), [settingsVersion]);
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

  const storageUsage = useDeferredCompute(async () => getStorageUsage(), []);
  const backupOverdue = useDeferredCompute(async () => {
    if (appSettings.autoBackupDays <= 0) return false;
    const last = await getLastBackupTime();
    if (!last || last === 0) return false;
    return Date.now() - last > appSettings.autoBackupDays * 24 * 60 * 60 * 1000;
  }, [appSettings]);
  const lastBackup = useDeferredCompute(() => getLastBackupTime(), []);

  const velocity7 = useDeferredCompute(() => calcVelocity(reviewLog, 7), [reviewLog]);
  const plannerConfig = useDeferredCompute(() => loadPlanner(), []);

  const plannerData = useDeferredCompute(() => {
    if (!plannerConfig?.finalGoalDate || velocity7 === null) return null;
    const remaining = stats.totalSections - stats.learnedSections;
    const estimated = calcEstimatedFinish(remaining, velocity7);
    const status = getPlannerStatus(estimated, plannerConfig.finalGoalDate, plannerConfig.bufferPercent ?? 15);
    const suggestion = getSmartSuggestion(null, cards, plannerConfig.finalGoalDate, velocity7, plannerConfig.bufferPercent ?? 15);
    const timeRec = suggestion ? calcDailyTimeRecommendation(suggestion.suggestedToday, velocity7, stats.due) : null;
    const activePhase = null;
    const dailyMapped = getDailyMappedCount();
    const dailyQuota = suggestion?.suggestedToday ?? 0;
    const redistResult = autoRedistributeIfNeeded(cards, plannerConfig.finalGoalDate, plannerConfig.bufferPercent ?? 15);
    return { status, suggestion, timeRec, remaining, totalSections: stats.totalSections, learnedSections: stats.learnedSections, activePhase, dailyMapped, dailyQuota, redistResult };
  }, [stats, velocity7, plannerConfig, cards]);

  const cognitiveDebt = useDeferredCompute(() => getCognitiveDebt(dailyGoal), [dailyGoal]);
  const energyRec = useDeferredCompute(() => calcEnergyRecommendation(), []);

  // Record discipline for yesterday (side effect — must be in useEffect, not useMemo)
  const disciplineRecordedRef = useRef<string>("");
  useEffect(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    // Guard: only record once per day key to prevent StrictMode double-fire
    if (disciplineRecordedRef.current === yKey) return;
    const log = loadDisciplineLog();
    if (log.find(e => e.date === yKey)) { disciplineRecordedRef.current = yKey; return; }
    const yStart = new Date(yKey).getTime();
    const yEnd = yStart + 86400000;
    const yReviews = reviewLog.filter(e => e.timestamp >= yStart && e.timestamp < yEnd).length;
    const slippageLog = loadSlippageLog();
    const ySlippage = slippageLog.find(s => s.date === yKey)?.slippageMs ?? null;
    recordDayDiscipline(yKey, yReviews, dailyGoal, ySlippage);
    disciplineRecordedRef.current = yKey;
  }, [reviewLog, dailyGoal]);

  const energyLevel = getEnergyLevel();

  const velocityData = useDeferredCompute(() => {
    if (velocity7 === null) return null;
    const velocityPrev = calcVelocity(reviewLog, 14) - velocity7;
    const trend = velocity7 > velocityPrev ? "up" : velocity7 < velocityPrev ? "down" : "flat";
    return { velocity: Math.round(velocity7 * 10) / 10, trend } as const;
  }, [velocity7, reviewLog]);

  const weakestCategories = useMemo(() => {
    return categories
      .filter(cat => categoryStats[cat]?.total > 0)
      .map(cat => ({
        name: categoryRecords.find(r => r.id === cat)?.name || cat,
        score: categoryStats[cat].score,
        total: categoryStats[cat].total,
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 3);
  }, [categories, categoryStats, categoryRecords]);

  const studyFlowData = useDeferredCompute<StudyFlowData | null>(() => {
    if (!plannerConfig?.finalGoalDate || categoryRecords.length === 0 || velocity7 === null) return null;
    const plans = generateStudyPlan(plannerConfig, categoryRecords, cards);
    if (plans.length === 0) return null;
    const today = startOfDay(new Date()).getTime();
    const active = plans.find(p => startOfDay(p.startDate).getTime() <= today && today < startOfDay(p.endDate).getTime());
    const focus = active || plans[0];
    const overallPct = stats.totalSections > 0 ? Math.round((stats.learnedSections / stats.totalSections) * 100) : 0;
    const ratio = calcLearningReviewRatio(overallPct);
    const dailyMapped = getDailyMappedCount();
    // Reuse plannerData suggestion instead of calling getSmartSuggestion again
    const dailyQuota = plannerData?.suggestion?.suggestedToday ?? 0;
    return {
      focusSubject: focus.categoryName,
      dailyMapped,
      dailyQuota,
      learnPct: ratio.learnPct,
      reviewPct: ratio.reviewPct,
      ratioLabel: ratio.label,
      overallPct,
    };
  }, [stats, categoryRecords, cards, velocity7, plannerConfig, plannerData]);

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
      icons.push({ key: "memory", icon: createElement(ShieldAlert, { className: "h-4 w-4" }), color: "text-destructive", label: `Rizik od zagušenja memorije — potrebno ${focusRatio.targetReviewPct}% ponavljanja, stvarno ${actualRatio.actualReviewPct}%`, critical: true });
    }
    if (cognitiveDebt) {
      icons.push({ key: "debt", icon: createElement(AlertTriangle, { className: "h-4 w-4" }), color: "text-warning", label: cognitiveDebt.message, critical: false });
    }
    if (backupOverdue) {
      icons.push({ key: "backup", icon: createElement(Download, { className: "h-4 w-4" }), color: "text-warning", label: lastBackup && lastBackup > 0 ? `Backup zastarjeo — posljednji: ${new Date(lastBackup).toLocaleDateString("sr-Latn")}` : "Nikad niste napravili backup", critical: false });
    }
    if (storageUsage && storageUsage.percent > 70) {
      icons.push({ key: "storage", icon: createElement(HardDrive, { className: "h-4 w-4" }), color: storageUsage.percent > 90 ? "text-destructive" : "text-warning", label: `Prostor: ${storageUsage.percent}% — ${(storageUsage.usedBytes / 1024 / 1024).toFixed(1)} MB / ${(storageUsage.maxBytes / 1024 / 1024).toFixed(0)} MB`, critical: storageUsage.percent > 90 });
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

  return {
    wc, todayReviews, dailyGoal, goalProgress, pendingFirstReview, streak,
    focusRatio, actualRatio, autoSuggestion, storageUsage, plannerData,
    velocityData, weakestCategories, briefText, statusIcons, statusColor, statusMessage,
    studyFlowData,
  };
}
