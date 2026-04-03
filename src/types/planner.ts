import type { DisciplineStatus } from "@/lib/planner-storage";

/** A single data point on the burn-up chart */
export interface BurnupDataPoint {
  date: string;
  ideal: number | null;
  actual: number | null;
}

/** Per-subject generated plan */
export interface SubjectPlan {
  categoryId: string;
  categoryName: string;
  weight: number;           // 1.0 or 1.5 for hard subjects
  totalSections: number;
  learnedSections: number;
  pct: number;
  allocatedDays: number;
  startDate: Date;
  endDate: Date;
  units: SubjectUnit[];
}

/** Sub-unit within a subject (subcategory or chapter) */
export interface SubjectUnit {
  id: string;
  name: string;
  totalSections: number;
  learnedSections: number;
  pct: number;
  allocatedDays: number;
}

/** Learning/review ratio */
export interface LearningReviewRatio {
  learnPct: number;
  reviewPct: number;
  label: string;
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
