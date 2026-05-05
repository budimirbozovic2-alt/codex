/**
 * Shared types and defaults for the planner namespace.
 * Pure data — no IDB or React imports — so any sub-module can depend on it
 * without creating cycles.
 */

export interface StudyPhase {
  id: string;
  name: string;
  expectedDays: number;
  categories: string[];
}

/** @deprecated kept for migration */
export interface StudyDecade {
  id: string;
  name: string;
  durationDays: number;
  categories: string[];
  startDate: string;
}

export interface PlannerConfig {
  finalGoalDate: string | null;
  createdAt: number;
  bufferPercent: number;
  dailyAvailableMinutes: number;
  hardSubjects: string[];
  subjectOrder: string[];
  /** @deprecated kept for migration */
  phases?: StudyPhase[];
  /** @deprecated migrated to phases */
  decades?: StudyDecade[];
}

export const DEFAULT_CONFIG: PlannerConfig = {
  finalGoalDate: null,
  createdAt: Date.now(),
  bufferPercent: 15,
  dailyAvailableMinutes: 0,
  hardSubjects: [],
  subjectOrder: [],
};

export interface PhaseProgress {
  phase: StudyPhase;
  total: number;
  learned: number;
  pct: number;
  remainingCards: number;
}

export interface SmartSuggestion {
  suggestedToday: number;
  message: string;
  burnoutWarning: boolean;
}

export type PlannerStatus = "green" | "yellow" | "red" | "no-goal";

export type DisciplineStatus = "diligent" | "neutral" | "lazy";

export interface DisciplineEntry {
  date: string;
  status: DisciplineStatus;
  planCompletion: number;
  slippageMs: number | null;
  reviewsDone: number;
  suggestedReviews: number;
}

export interface DailyPhaseProgress {
  phaseName: string;
  phaseTotal: number;
  phaseLearned: number;
  phasePct: number;
  dailyQuota: number;
  dailyDone: number;
  dailyPct: number;
}
