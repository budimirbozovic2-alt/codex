import type { StudyPhase, DisciplineStatus } from "@/lib/planner-storage";

/** A single data point on the burn-up chart */
export interface BurnupDataPoint {
  date: string;
  ideal: number | null;
  actual: number | null;
}

/** Per-phase progress item used in RoadmapTab & OperationsTab */
export interface PhaseProgressItem {
  id: string;
  name: string;
  expectedDays: number;
  categories: string[];
  total: number;
  learned: number;
  pct: number;
  remainingCards: number;
}

/** Dynamic date info for a phase */
export interface DynamicDateItem {
  phaseId: string;
  startDate: Date;
  endDate: Date;
  dynamicDays: number;
}

/** Smart suggestion from load balancer */
export interface SmartSuggestionItem {
  suggestedToday: number;
  message: string;
  burnoutWarning: boolean;
}

/** Daily time recommendation */
export interface TimeRecommendation {
  totalMinutes: number;
  hours: number;
  minutes: number;
  message: string;
}

/** Cognitive debt info */
export interface CognitiveDebtItem {
  hasDebt: boolean;
  debtCards: number;
  message: string;
}

/** Discipline log entry for grid display */
export interface DisciplineLogEntry {
  date: string;
  status: DisciplineStatus;
  planCompletion: number;
  slippageMs: number | null;
  reviewsDone: number;
  suggestedReviews: number;
}

/** Discipline trend data point */
export interface DisciplineTrendPoint {
  date: string;
  diligentPct: number;
}

/** Recharts tooltip payload item */
export interface RechartsPayloadItem {
  name: string;
  value: number;
  color?: string;
  stroke?: string;
  dataKey: string;
}
