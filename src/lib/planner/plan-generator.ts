/** Subject-oriented plan generator + learning/review ratio heuristic. */
import { addDays, differenceInDays } from "date-fns";
import type { Card } from "../spaced-repetition";
import type { CategoryRecord } from "../db";
import type { SubjectPlan, SubjectUnit, LearningReviewRatio } from "@/types/planner";
import type { PlannerConfig } from "./types";

export function generateStudyPlan(
  config: PlannerConfig,
  categoryRecords: CategoryRecord[],
  cards: Card[],
): SubjectPlan[] {
  if (!config.finalGoalDate || categoryRecords.length === 0) return [];

  const goal = new Date(config.finalGoalDate);
  const bufferDays = Math.round(differenceInDays(goal, new Date()) * (config.bufferPercent / 100));
  const effectiveGoal = addDays(goal, -bufferDays);
  const totalEffectiveDays = Math.max(1, differenceInDays(effectiveGoal, new Date()));

  const orderedCats = config.subjectOrder.length > 0
    ? config.subjectOrder
        .map(id => categoryRecords.find(r => r.id === id))
        .filter((r): r is CategoryRecord => !!r)
    : [...categoryRecords];

  for (const r of categoryRecords) {
    if (!orderedCats.find(c => c.id === r.id)) orderedCats.push(r);
  }

  const subjectData: { cat: CategoryRecord; weight: number; totalSections: number; learnedSections: number; catCards: Card[] }[] = [];
  let totalWeightedSections = 0;

  for (const cat of orderedCats) {
    const catCards = cards.filter(c => c.categoryId === cat.id);
    let total = 0, learned = 0;
    catCards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
    const weight = config.hardSubjects.includes(cat.id) ? 1.5 : 1.0;
    totalWeightedSections += total * weight;
    subjectData.push({ cat, weight, totalSections: total, learnedSections: learned, catCards });
  }

  if (totalWeightedSections === 0) return [];

  let cursor = new Date();
  const plans: SubjectPlan[] = [];

  for (const sd of subjectData) {
    const proportion = (sd.totalSections * sd.weight) / totalWeightedSections;
    const allocatedDays = Math.max(1, Math.round(totalEffectiveDays * proportion));
    const startDate = new Date(cursor);
    const endDate = addDays(cursor, allocatedDays);

    const subcatMap = new Map<string, { name: string; total: number; learned: number }>();
    const subs = sd.cat.subcategories || [];

    for (const card of sd.catCards) {
      const subId = card.subcategoryId || "__none__";
      const subRec = subs.find(s => s.id === subId);
      const subName = subRec?.name || (subId === "__none__" ? "Ostalo" : "Ostalo");
      if (!subcatMap.has(subId)) subcatMap.set(subId, { name: subName, total: 0, learned: 0 });
      const entry = subcatMap.get(subId)!;
      card.sections.forEach(s => { entry.total++; if (s.lastReviewed) entry.learned++; });
    }

    const unitEntries = Array.from(subcatMap.entries());
    const unitTotalSections = unitEntries.reduce((s, [, v]) => s + v.total, 0) || 1;
    const units: SubjectUnit[] = unitEntries.map(([id, v]) => ({
      id,
      name: v.name,
      totalSections: v.total,
      learnedSections: v.learned,
      pct: v.total > 0 ? Math.round((v.learned / v.total) * 100) : 0,
      allocatedDays: Math.max(1, Math.round(allocatedDays * (v.total / unitTotalSections))),
    }));

    plans.push({
      categoryId: sd.cat.id,
      categoryName: sd.cat.name,
      weight: sd.weight,
      totalSections: sd.totalSections,
      learnedSections: sd.learnedSections,
      pct: sd.totalSections > 0 ? Math.round((sd.learnedSections / sd.totalSections) * 100) : 0,
      allocatedDays,
      startDate,
      endDate,
      units,
    });

    cursor = endDate;
  }

  return plans;
}

export function calcLearningReviewRatio(overallProgressPct: number): LearningReviewRatio {
  if (overallProgressPct < 20) return { learnPct: 90, reviewPct: 10, label: "Faza intenzivnog učenja" };
  if (overallProgressPct < 50) return { learnPct: 70, reviewPct: 30, label: "Učenje + konsolidacija" };
  if (overallProgressPct < 80) return { learnPct: 40, reviewPct: 60, label: "Fokus na ponavljanje" };
  return { learnPct: 10, reviewPct: 90, label: "Finalno ponavljanje" };
}
