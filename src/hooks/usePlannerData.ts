import { useState, useMemo, useCallback } from "react";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import {
  loadPlanner, savePlanner, StudyPhase, PlannerConfig,
  calcVelocity, calcEstimatedFinish, getPlannerStatus, getSmartSuggestion,
  calcDailyTimeRecommendation, calcPhaseProgress, calcDynamicPhaseDates,
  calcRebalancedQuota, buildBurnupData, getProjectionText,
  loadDisciplineLog, getDisciplineTrend,
  getCognitiveDebt, getPhaseDisciplinePct,
} from "@/lib/planner-storage";
import { differenceInDays } from "date-fns";

export function usePlannerData(cards: SRCard[], reviewLog: ReviewLogEntry[]) {
  const [config, setConfig] = useState<PlannerConfig>(() => loadPlanner());

  const totalSections = useMemo(() => cards.reduce((s, c) => s + c.sections.length, 0), [cards]);
  const learnedSections = useMemo(() => {
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) count++; }));
    return count;
  }, [cards]);
  const remaining = totalSections - learnedSections;

  const velocity = useMemo(() => calcVelocity(reviewLog, 7), [reviewLog]);
  const estimatedFinish = useMemo(() => calcEstimatedFinish(remaining, velocity), [remaining, velocity]);
  const plannerStatus = useMemo(() => getPlannerStatus(estimatedFinish, config.finalGoalDate, config.bufferPercent), [estimatedFinish, config.finalGoalDate, config.bufferPercent]);

  const phaseProgressList = useMemo(() => config.phases.map(p => ({ ...p, ...calcPhaseProgress(p, cards) })), [config.phases, cards]);
  const currentPhase = useMemo(() => phaseProgressList.find(p => p.pct < 100) || phaseProgressList[0] || null, [phaseProgressList]);

  const smartSuggestion = useMemo(() => getSmartSuggestion(currentPhase?.phase || null, cards, config.finalGoalDate, velocity, config.bufferPercent), [currentPhase, cards, config.finalGoalDate, velocity, config.bufferPercent]);

  const dynamicDates = useMemo(() => calcDynamicPhaseDates(config.phases, cards, velocity), [config.phases, cards, velocity]);

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

  const totalTimelineDays = useMemo(() => {
    return dynamicDates.reduce((s, d) => s + d.dynamicDays, 0) || config.phases.reduce((s, p) => s + p.expectedDays, 0);
  }, [dynamicDates, config.phases]);

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

  const save = useCallback((updated: PlannerConfig) => {
    setConfig(updated);
    savePlanner(updated);
  }, []);

  return {
    config, save,
    totalSections, learnedSections, remaining, velocity,
    estimatedFinish, plannerStatus,
    phaseProgressList, currentPhase,
    smartSuggestion, dynamicDates, dueCount,
    timeRec, debt,
    disciplineLog, disciplineTrend, phaseDisciplinePct,
    burnupData, projectionText, totalTimelineDays,
    streak, bestStreak,
  };
}
