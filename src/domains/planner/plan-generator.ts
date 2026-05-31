/** Subject-oriented plan generator + learning/review ratio heuristic. */
import { addDays, differenceInDays } from "date-fns";
import type { Card } from "@/lib/spaced-repetition";
import type { CategoryRecord } from "@/lib/db-types";
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

  const catById = new Map<string, CategoryRecord>();
  for (const r of categoryRecords) catById.set(r.id, r);

  const orderedCats: CategoryRecord[] = [];
  const seen = new Set<string>();
  for (const id of config.subjectOrder) {
    const r = catById.get(id);
    if (r && !seen.has(r.id)) { orderedCats.push(r); seen.add(r.id); }
  }
  for (const r of categoryRecords) {
    if (!seen.has(r.id)) { orderedCats.push(r); seen.add(r.id); }
  }

  // Bucket cards by categoryId once (was O(n²) via Array.filter inside loop).
  const cardsByCat = new Map<string, Card[]>();
  for (const c of cards) {
    const arr = cardsByCat.get(c.categoryId);
    if (arr) arr.push(c); else cardsByCat.set(c.categoryId, [c]);
  }

  const hardSet = new Set(config.hardSubjects);
  const subjectData: { cat: CategoryRecord; weight: number; totalSections: number; learnedSections: number; catCards: Card[] }[] = [];
  let totalWeightedSections = 0;

  for (const cat of orderedCats) {
    const catCards = cardsByCat.get(cat.id) ?? [];
    let total = 0, learned = 0;
    catCards.forEach(c => c.sections.forEach(s => { total++; if (s.lastReviewed) learned++; }));
    const weight = hardSet.has(cat.id) ? 1.5 : 1.0;
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
    const subById = new Map(subs.map(s => [s.id, s]));

    for (const card of sd.catCards) {
      const subId = card.subcategoryId || "__none__";
      const subRec = subById.get(subId);
      const subName = subRec?.name || "Ostalo";
      let entry = subcatMap.get(subId);
      if (!entry) { entry = { name: subName, total: 0, learned: 0 }; subcatMap.set(subId, entry); }
      card.sections.forEach(s => { entry!.total++; if (s.lastReviewed) entry!.learned++; });
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
