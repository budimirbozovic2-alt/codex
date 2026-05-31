/** Phase-level progress aggregations. */
import type { Card } from "../spaced-repetition";
import type { StudyPhase, PhaseProgress, DisciplineEntry } from "./types";

export function calcPhaseProgress(phase: StudyPhase, cards: Card[]): PhaseProgress {
  const relevant = phase.categories.length > 0
    ? cards.filter(c => phase.categories.includes(c.categoryId))
    : cards;
  const total = relevant.reduce((s, c) => s + c.sections.length, 0);
  let learned = 0;
  relevant.forEach(c => c.sections.forEach(s => { if (s.lastReviewed) learned++; }));
  return { phase, total, learned, pct: total > 0 ? Math.round((learned / total) * 100) : 0, remainingCards: total - learned };
}

/** Phase-specific discipline percentage (rolling 14d). */
export function getPhaseDisciplinePct(disciplineLog: DisciplineEntry[]): number {
  if (disciplineLog.length === 0) return 0;
  const recent = disciplineLog.slice(-14);
  const diligent = recent.filter(e => e.status === "diligent").length;
  return Math.round((diligent / recent.length) * 100);
}
