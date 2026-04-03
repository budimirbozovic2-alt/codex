import { useState, useMemo, useCallback } from "react";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CategoryRecord } from "@/lib/db";
import { calcCategoryStability } from "@/lib/analytics/stability";
import {
  loadPlanner, savePlanner, PlannerConfig,
  calcVelocity, calcEstimatedFinish, getPlannerStatus, getSmartSuggestion,
  calcDailyTimeRecommendation,
  calcRebalancedQuota, buildBurnupData, getProjectionText,
  loadDisciplineLog, getDisciplineTrend,
  getCognitiveDebt, getPhaseDisciplinePct,
  generateStudyPlan, calcLearningReviewRatio,
} from "@/lib/planner-storage";

export function usePlannerData(cards: SRCard[], reviewLog: ReviewLogEntry[], categoryRecords: CategoryRecord[]) {
  const [config, setConfig] = useState<PlannerConfig>(() => loadPlanner());

  const totalSections = useMemo(() => cards.reduce((s, c) => s + c.sections.length, 0), [cards]);
  const learnedSections = useMemo(() => {
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) count++; }));
    return count;
  }, [cards]);
  const remaining = totalSections - learnedSections;
  const overallPct = totalSections > 0 ? Math.round((learnedSections / totalSections) * 100) : 0;

  const velocity = useMemo(() => calcVelocity(reviewLog, 7), [reviewLog]);
  const estimatedFinish = useMemo(() => calcEstimatedFinish(remaining, velocity), [remaining, velocity]);
  const plannerStatus = useMemo(() => getPlannerStatus(estimatedFinish, config.finalGoalDate, config.bufferPercent), [estimatedFinish, config.finalGoalDate, config.bufferPercent]);

  // Subject-oriented plan
  const subjectPlans = useMemo(() => generateStudyPlan(config, categoryRecords, cards), [config, categoryRecords, cards]);

  // Learning/review ratio
  const learningRatio = useMemo(() => calcLearningReviewRatio(overallPct), [overallPct]);

  // Smart suggestion uses global remaining (no phase)
  const smartSuggestion = useMemo(() => getSmartSuggestion(null, cards, config.finalGoalDate, velocity, config.bufferPercent), [cards, config.finalGoalDate, velocity, config.bufferPercent]);

  const dueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.nextReview && s.nextReview <= now) count++; }));
    return count;
  }, [cards]);

  const timeRec = useMemo(() => {
    if (!smartSuggestion) return null;
    return calcDailyTimeRecommendation(smartSuggestion.suggestedToday, velocity, dueCount);
  }, [smartSuggestion, velocity, dueCount]);

  const debt = useMemo(() => getCognitiveDebt(smartSuggestion?.suggestedToday ?? 0), [smartSuggestion]);

  const disciplineLog = useMemo(() => loadDisciplineLog(), []);
  const disciplineTrend = useMemo(() => getDisciplineTrend(30), []);
  const phaseDisciplinePct = useMemo(() => getPhaseDisciplinePct(disciplineLog), [disciplineLog]);

  const burnupData = useMemo(() => buildBurnupData(reviewLog, totalSections, config.finalGoalDate, config.bufferPercent), [reviewLog, totalSections, config.finalGoalDate, config.bufferPercent]);

  const projectionText = useMemo(() => getProjectionText(velocity, remaining, config.finalGoalDate, config.bufferPercent), [velocity, remaining, config.finalGoalDate, config.bufferPercent]);

  const { streak, bestStreak } = useMemo(() => {
    let streak = 0;
    const sorted = [...disciplineLog].sort((a, b) => b.date.localeCompare(a.date));
    for (const entry of sorted) {
      if (entry.status === "diligent") streak++;
      else break;
    }
    let best = 0, cur = 0;
    const asc = [...disciplineLog].sort((a, b) => a.date.localeCompare(b.date));
    for (const e of asc) {
      if (e.status === "diligent") { cur++; best = Math.max(best, cur); }
      else cur = 0;
    }
    return { streak, bestStreak: best };
  }, [disciplineLog]);

  const isConfigured = config.dailyAvailableMinutes > 0 && !!config.finalGoalDate;

  const save = useCallback((updated: PlannerConfig) => {
    setConfig(updated);
    savePlanner(updated);
  }, []);

  return {
    config, save, isConfigured,
    totalSections, learnedSections, remaining, overallPct, velocity,
    estimatedFinish, plannerStatus,
    subjectPlans, learningRatio,
    smartSuggestion, dueCount,
    timeRec, debt,
    disciplineLog, disciplineTrend, phaseDisciplinePct,
    burnupData, projectionText,
    streak, bestStreak,
  };
}
