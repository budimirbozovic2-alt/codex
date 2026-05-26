import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card as SRCard } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { CategoryRecord } from "@/lib/db";
import { analyticsClient } from "@/lib/analytics/workerClient";
import type { PlannerConfig } from "@/lib/planner-storage";
import { queryKeys } from "@/lib/query/keys";
import {
  hashReviewLog,
  hashCards,
  hashCategories,
  hashPlannerConfig,
} from "@/lib/query/hash";

// R2 fix: lazy-import planner-storage to avoid eagerly loading 577-line module + date-fns
type PlannerModule = typeof import("@/lib/planner-storage");
let _plannerMod: PlannerModule | null = null;
async function getPlannerModule(): Promise<PlannerModule> {
  if (!_plannerMod) _plannerMod = await import("@/lib/planner-storage");
  return _plannerMod;
}

export function usePlannerData(cards: SRCard[], reviewLog: ReviewLogEntry[], categoryRecords: CategoryRecord[]) {
  const [config, setConfig] = useState(() => {
    // Initial sync load for config to avoid UI flicker
    // This is fine as it's a small JSON object from localStorage
    const saved = localStorage.getItem("sr-planner-config");
    if (!saved) return { dailyAvailableMinutes: 0, finalGoalDate: "", bufferPercent: 15 };
    try { return JSON.parse(saved); } catch { return { dailyAvailableMinutes: 0, finalGoalDate: "", bufferPercent: 15 }; }
  });

  const totalSections = useMemo(() => cards.reduce((s, c) => s + c.sections.length, 0), [cards]);
  const learnedSections = useMemo(() => {
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) count++; }));
    return count;
  }, [cards]);
  const remaining = totalSections - learnedSections;
  const overallPct = totalSections > 0 ? Math.round((learnedSections / totalSections) * 100) : 0;

  // ── Stable hashes (zaobilaze object-identity refetch loop) ──
  const reviewLogHash = useMemo(() => hashReviewLog(reviewLog), [reviewLog]);
  const cardsHash = useMemo(() => hashCards(cards), [cards]);
  const categoryHash = useMemo(() => hashCategories(categoryRecords), [categoryRecords]);
  const configHash = useMemo(() => hashPlannerConfig(config), [config]);

  const { data: velocity = null } = useQuery({
    queryKey: queryKeys.planner.velocity(reviewLogHash, 7),
    queryFn: async () => {
      const mod = await getPlannerModule();
      return mod.calcVelocity(reviewLog, 7);
    },
  });

  const { data: estimatedFinish = null } = useQuery({
    queryKey: queryKeys.planner.estimatedFinish(remaining, velocity),
    queryFn: async () => {
      if (velocity === null) return null;
      const mod = await getPlannerModule();
      return mod.calcEstimatedFinish(remaining, velocity);
    },
    enabled: velocity !== null,
  });

  const { data: plannerStatus = null } = useQuery({
    queryKey: queryKeys.planner.plannerStatus(estimatedFinish, config.finalGoalDate, config.bufferPercent),
    queryFn: async () => {
      if (estimatedFinish === null) return null;
      const mod = await getPlannerModule();
      return mod.getPlannerStatus(estimatedFinish, config.finalGoalDate, config.bufferPercent);
    },
    enabled: estimatedFinish !== null,
  });

  // Subject-oriented plan
  const { data: subjectPlans = null } = useQuery({
    queryKey: queryKeys.planner.subjectPlans(configHash, categoryHash, cardsHash),
    queryFn: async () => {
      const mod = await getPlannerModule();
      return mod.generateStudyPlan(config, categoryRecords, cards);
    },
  });

  // Learning/review ratio
  const learningRatio = useMemo(() => {
    // This is a simple calculation, no need for deferred
    const learnPct = Math.max(10, 100 - overallPct);
    const reviewPct = 100 - learnPct;
    const label = learnPct > 70 ? "Fokus na učenje" : learnPct > 40 ? "Balansirano" : "Fokus na ponavljanje";
    return { learnPct, reviewPct, label };
  }, [overallPct]);

  // Smart suggestion uses global remaining (no phase)
  const { data: smartSuggestion = null } = useQuery({
    queryKey: queryKeys.planner.smartSuggestion(cardsHash, config.finalGoalDate, velocity, config.bufferPercent),
    queryFn: async () => {
      if (velocity === null) return null;
      const mod = await getPlannerModule();
      return mod.getSmartSuggestion(null, cards, config.finalGoalDate, velocity, config.bufferPercent);
    },
    enabled: velocity !== null,
  });

  const dueCount = useMemo(() => {
    const now = Date.now();
    let count = 0;
    cards.forEach(c => c.sections.forEach(s => { if (s.nextReview && s.nextReview <= now) count++; }));
    return count;
  }, [cards]);

  const { data: timeRec = null } = useQuery({
    queryKey: queryKeys.planner.timeRec(smartSuggestion?.suggestedToday ?? null, velocity, dueCount),
    queryFn: async () => {
      if (!smartSuggestion || velocity === null) return null;
      const mod = await getPlannerModule();
      return mod.calcDailyTimeRecommendation(smartSuggestion.suggestedToday, velocity, dueCount);
    },
    enabled: !!smartSuggestion && velocity !== null,
  });

  const debt = useMemo<import("@/types/planner").CognitiveDebtItem | null>(() => {
    if (!smartSuggestion) return null;
    const debtCards = Math.max(0, smartSuggestion.suggestedToday - 5);
    if (debtCards <= 0) return null;
    return {
      hasDebt: true,
      debtCards,
      message: `Kognitivni dug: ${debtCards} kartica iznad održivog dnevnog tempa.`,
    };
  }, [smartSuggestion]);

  const { data: disciplineLog = null } = useQuery({
    queryKey: queryKeys.planner.disciplineLog(),
    queryFn: async () => {
      const mod = await getPlannerModule();
      return mod.loadDisciplineLog();
    },
  });

  const { data: disciplineTrend = null } = useQuery({
    queryKey: queryKeys.planner.disciplineTrend(30),
    queryFn: async () => {
      const mod = await getPlannerModule();
      return mod.getDisciplineTrend(30);
    },
  });

  const { data: phaseDisciplinePct = 0 } = useQuery({
    queryKey: queryKeys.planner.phaseDisciplinePct(),
    queryFn: async () => {
      if (!disciplineLog) return 0;
      const mod = await getPlannerModule();
      return mod.getPhaseDisciplinePct(disciplineLog);
    },
    enabled: !!disciplineLog,
  });

  const { data: burnupData = null } = useQuery({
    queryKey: queryKeys.planner.burnup(reviewLogHash, totalSections, config.finalGoalDate, config.bufferPercent),
    queryFn: async () => {
      const mod = await getPlannerModule();
      return mod.buildBurnupData(reviewLog, totalSections, config.finalGoalDate, config.bufferPercent);
    },
  });

  const { data: projectionText = "" } = useQuery({
    queryKey: queryKeys.planner.projectionText(velocity, remaining, config.finalGoalDate, config.bufferPercent),
    queryFn: async () => {
      if (velocity === null) return "";
      const mod = await getPlannerModule();
      return mod.getProjectionText(velocity, remaining, config.finalGoalDate, config.bufferPercent);
    },
    enabled: velocity !== null,
  });

  const streaks = useMemo(() => {
    if (!disciplineLog) return { streak: 0, bestStreak: 0 };
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

  const { data: retentionRisk = [] } = useQuery({
    queryKey: queryKeys.planner.retentionRisk(cardsHash, categoryHash, config.finalGoalDate ?? null),
    queryFn: async () => {
      const catIds = categoryRecords.map(r => r.id);
      if (catIds.length === 0) return [];
      await getPlannerModule();
      const result = await analyticsClient.runCategoryStability(cards, catIds, config.finalGoalDate ?? null);
      return [...result].sort((a, b) => a.avgRetrievability - b.avgRetrievability);
    },
  });

  const save = useCallback(async (updated: PlannerConfig) => {
    setConfig(updated);
    const mod = await getPlannerModule();
    mod.savePlanner(updated);
  }, []);

  return {
    config, save, isConfigured,
    totalSections, learnedSections, remaining, overallPct, velocity,
    estimatedFinish, plannerStatus,
    subjectPlans, learningRatio,
    smartSuggestion, dueCount,
    timeRec, debt,
    retentionRisk,
    disciplineLog, disciplineTrend, phaseDisciplinePct,
    burnupData, projectionText,
    streak: streaks?.streak ?? 0,
    bestStreak: streaks?.bestStreak ?? 0,
  };
}
