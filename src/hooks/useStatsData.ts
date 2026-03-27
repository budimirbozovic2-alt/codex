import { useMemo } from "react";
import { Card, getSectionScore, SRSettings, DEFAULT_SR_SETTINGS } from "@/lib/spaced-repetition";
import { ReviewLogEntry } from "@/lib/storage";
import { getTimeDistribution } from "@/lib/metacognitive-storage";
import { getCardMasteryLevel } from "@/components/KnowledgeMap";
import { format, subDays, startOfDay, eachDayOfInterval } from "date-fns";
import { useDeferredCompute } from "@/hooks/useDeferredCompute";

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
      return {
        name: format(day, "dd.MM"),
        "Stvarni ponavljanje": total > 0 ? Math.round((review / total) * 100) : null,
        "Idealni cilj": focusRatio.targetReviewPct,
      };
    });
  }, [reviewLog, focusRatio]);

  const todayTime = useDeferredCompute(() => getTimeDistribution(1), []);

  const activityData = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 13);
    const days = eachDayOfInterval({ start, end: now });
    return days.map((day) => {
      const dayStart = startOfDay(day).getTime();
      const dayEnd = dayStart + 86400000;
      const reviews = reviewLog.filter((r) => r.timestamp >= dayStart && r.timestamp < dayEnd).length;
      const created = cards.filter((c) => c.createdAt >= dayStart && c.createdAt < dayEnd).length;
      return { name: format(day, "dd.MM"), Ponavljanja: reviews, "Nove kartice": created };
    });
  }, [reviewLog, cards]);

  const masteryData = useMemo(() => {
    let novo = 0, ucenje = 0, napredno = 0, savladano = 0;
    cards.forEach((c) => {
      c.sections.forEach((s) => {
        const score = getSectionScore(s);
        if (score === 0) novo++;
        else if (score < 40) ucenje++;
        else if (score < 70) napredno++;
        else savladano++;
      });
    });
    return [
      { name: "Novo", value: novo },
      { name: "Učenje", value: ucenje },
      { name: "Napredno", value: napredno },
      { name: "Savladano", value: savladano },
    ].filter((d) => d.value > 0);
  }, [cards]);

  const categoryChartData = useMemo(() => {
    return categories
      .filter((cat) => categoryStats[cat]?.total > 0)
      .map((cat) => ({
        name: cat.length > 12 ? cat.slice(0, 12) + "…" : cat,
        Znanje: categoryStats[cat].score,
        Kartice: categoryStats[cat].total,
      }));
  }, [categories, categoryStats]);

  const levelCounts = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    cards.forEach((c) => { counts[getCardMasteryLevel(c)]++; });
    return counts;
  }, [cards]);

  return {
    weights,
    focusRatio,
    ratioHistory,
    todayTime,
    activityData,
    masteryData,
    categoryChartData,
    levelCounts,
  };
}
