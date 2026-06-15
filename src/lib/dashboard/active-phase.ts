export interface StudyPlanPhase {
  categoryName: string;
  pct: number;
  learnedSections: number;
  totalSections: number;
}

export interface ActivePhase {
  name: string;
  pct: number;
  learned: number;
  total: number;
}

/** First incomplete subject plan, or the first plan when all are complete. */
export function resolveActivePhaseFromPlans(
  plans: StudyPlanPhase[],
): ActivePhase | null {
  const activeSubject = plans.find((p) => p.pct < 100) ?? plans[0] ?? null;
  if (!activeSubject) return null;
  return {
    name: activeSubject.categoryName,
    pct: activeSubject.pct,
    learned: activeSubject.learnedSections,
    total: activeSubject.totalSections,
  };
}
