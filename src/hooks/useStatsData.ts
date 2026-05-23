import { useMemo } from "react";
import { Card, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { getTimeDistribution } from "@/lib/metacognitive-storage";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";
import { useAnalyticsWorker } from "@/hooks/useAnalyticsWorker";
import { analyticsClient } from "@/lib/analytics/workerClient";
import type { ChartBundle } from "@/lib/analytics/_pure/charts";

interface StatsInput {
  cards: Card[];
  categories: string[];
  categoryStats: Record<string, { score: number; total: number; due: number }>;
  reviewLog: ReviewLogEntry[];
  srSettings: SRSettings;
}

export function useStatsData({ cards, categories, categoryStats, reviewLog, srSettings }: StatsInput) {
  const weights = srSettings?.resistanceWeights ?? DEFAULT_SR_SETTINGS.resistanceWeights;

  const focusRatio = useMemo(() => {
    if (srSettings.dailyGoal === 0) return { progress: 0, targetReviewPct: 5 };
    const progress = srSettings.dailyGoal > 0 && cards.length > 0
      ? Math.round((cards.reduce((s, c) => s + c.sections.filter(sec => sec.lastReviewed).length, 0) /
        Math.max(1, cards.reduce((s, c) => s + c.sections.length, 0))) * 100)
      : 0;
    return { progress, targetReviewPct: Math.max(5, progress) };
  }, [cards, srSettings]);

  // Heavy chart aggregations now run inside the analytics Web Worker.
  // Returns `null` until the worker responds — consumers render <TabSkeleton />.
  const charts = useAnalyticsWorker<ChartBundle>(
    () => analyticsClient.buildCharts(cards, reviewLog, focusRatio.targetReviewPct),
    [cards, reviewLog, focusRatio.targetReviewPct],
  );

  const todayTime = useDeferredCompute(() => getTimeDistribution(1), []);

  const categoryChartData = useMemo(() => {
    return categories
      .filter((cat) => categoryStats[cat]?.total > 0)
      .map((cat) => ({
        name: cat.length > 12 ? cat.slice(0, 12) + "…" : cat,
        Znanje: categoryStats[cat].score,
        Kartice: categoryStats[cat].total,
      }));
  }, [categories, categoryStats]);

  return {
    weights,
    focusRatio,
    ratioHistory: charts?.ratioHistory ?? null,
    todayTime,
    activityData: charts?.activityData ?? null,
    masteryData: charts?.masteryData ?? null,
    categoryChartData,
    levelCounts: charts?.levelCounts ?? null,
    chartsReady: charts !== null,
  };
}
