/**
 * Subject readiness ("Spremnost") — Themis-style pass predictor per category.
 *
 * Combines coverage, FSRS retention, and weak-area pressure into one 0–100 score.
 * Pure domain — no React, no I/O.
 */
import {
  type Card,
  type SRSettings,
  SectionState,
  getSectionScore,
  getErrorStatus,
  isLeech,
} from "@/lib/spaced-repetition";
import { resolveEffectiveSrParams } from "@/domains/subjects/subject-settings";
import type { PlannerStatus } from "@/domains/planner/types";

export type ReadinessLevel = "visoka" | "solidna" | "umjerena" | "niska" | "kritična";

export interface ReadinessRisk {
  code: string;
  label: string;
  severity: "warning" | "critical";
}

export interface SubjectReadinessBreakdown {
  /** Final 0–100 score after optional planner adjustment. */
  score: number;
  level: ReadinessLevel;
  /** Weighted components (0–100 each). */
  coverage: number;
  retention: number;
  health: number;
  /** Raw percentages before weighting (for tooltips). */
  coveragePct: number;
  retentionPct: number;
  healthPct: number;
  /** Top risks sorted by severity. */
  risks: ReadinessRisk[];
  plannerAdjustment: number;
}

export interface SubjectReadinessOptions {
  srSettings: SRSettings;
  plannerStatus?: PlannerStatus;
  plannerDaysLate?: number;
}

const WEIGHT_COVERAGE = 0.4;
const WEIGHT_RETENTION = 0.35;
const WEIGHT_HEALTH = 0.25;

export function computeCoveragePct(cards: readonly Card[]): number {
  let total = 0;
  let learned = 0;
  for (const card of cards) {
    for (const sec of card.sections ?? []) {
      total++;
      if (sec.state !== SectionState.New) learned++;
    }
  }
  if (total === 0) return 0;
  return Math.round((learned / total) * 100);
}

export function computeRetentionPct(cards: readonly Card[]): number {
  let sum = 0;
  let count = 0;
  for (const card of cards) {
    for (const sec of card.sections ?? []) {
      if (sec.state === SectionState.New) continue;
      sum += getSectionScore(sec);
      count++;
    }
  }
  if (count === 0) return 0;
  return Math.round(sum / count);
}

export function computeHealthPct(
  cards: readonly Card[],
  srSettings: SRSettings,
): { healthPct: number; risks: ReadinessRisk[] } {
  if (cards.length === 0) return { healthPct: 0, risks: [] };

  const risks: ReadinessRisk[] = [];
  let weakCards = 0;
  let activeErrors = 0;
  let endangeredCount = 0;
  let leechCount = 0;

  for (const card of cards) {
    let weak = false;

    if (card.type === "essay" && card.isEndangered) {
      endangeredCount++;
      weak = true;
    }

    for (const entry of card.errorLog ?? []) {
      const status = getErrorStatus(entry);
      if (status !== "mastered") {
        activeErrors++;
        weak = true;
        break;
      }
    }

    const { srSettings: local } = resolveEffectiveSrParams(card.categoryId, srSettings);
    for (const sec of card.sections ?? []) {
      if (sec.state !== SectionState.New && isLeech(sec, local)) {
        leechCount++;
        weak = true;
        break;
      }
    }

    if (weak) weakCards++;
  }

  const errorRate = weakCards / cards.length;
  const healthPct = Math.round((1 - errorRate) * 100);

  if (endangeredCount > 0) {
    risks.push({
      code: "endangered",
      label: `${endangeredCount} ugrožen${endangeredCount === 1 ? " koncept" : "a koncepta"}`,
      severity: "critical",
    });
  }
  if (activeErrors > 0) {
    risks.push({
      code: "errors",
      label: `${activeErrors} kartic${activeErrors === 1 ? "a" : "e"} sa aktivnim greškama`,
      severity: activeErrors >= 3 ? "critical" : "warning",
    });
  }
  if (leechCount > 0) {
    risks.push({
      code: "leeches",
      label: `${leechCount} leech sekcij${leechCount === 1 ? "a" : "a"}`,
      severity: leechCount >= 5 ? "critical" : "warning",
    });
  }

  return { healthPct, risks };
}

function plannerPenalty(status?: PlannerStatus, daysLate?: number): number {
  if (!status || status === "no-goal" || status === "green") return 0;
  if (status === "yellow") return 3;
  if (status === "red") return Math.min(12, 8 + Math.floor((daysLate ?? 0) / 7));
  return 0;
}

export function readinessLevelFromScore(score: number): ReadinessLevel {
  if (score >= 80) return "visoka";
  if (score >= 65) return "solidna";
  if (score >= 50) return "umjerena";
  if (score >= 35) return "niska";
  return "kritična";
}

export const READINESS_LEVEL_LABELS: Record<ReadinessLevel, string> = {
  visoka: "Visoka spremnost",
  solidna: "Solidna spremnost",
  umjerena: "Umjerena spremnost",
  niska: "Niska spremnost",
  "kritična": "Kritična spremnost",
};

/**
 * Spremnost = 0.4×pokrivenost + 0.35×zadržavanje + 0.25×(100×(1−errorRate))
 * minus optional planner lag penalty.
 */
export function computeSubjectReadiness(
  cards: readonly Card[],
  options: SubjectReadinessOptions,
): SubjectReadinessBreakdown {
  const coveragePct = computeCoveragePct(cards);
  const retentionPct = computeRetentionPct(cards);
  const { healthPct, risks: healthRisks } = computeHealthPct(cards, options.srSettings);

  const raw =
    WEIGHT_COVERAGE * coveragePct
    + WEIGHT_RETENTION * retentionPct
    + WEIGHT_HEALTH * healthPct;

  const plannerAdjustment = plannerPenalty(options.plannerStatus, options.plannerDaysLate);
  const score = Math.max(0, Math.min(100, Math.round(raw - plannerAdjustment)));

  const risks = [...healthRisks];
  if (coveragePct < 30 && cards.length > 0) {
    risks.push({
      code: "low-coverage",
      label: `Niska pokrivenost (${coveragePct}%)`,
      severity: "warning",
    });
  }
  if (retentionPct < 45 && computeCoveragePct(cards) > 10) {
    risks.push({
      code: "low-retention",
      label: `Slabo zadržavanje (${retentionPct}%)`,
      severity: retentionPct < 30 ? "critical" : "warning",
    });
  }
  if (options.plannerStatus === "red") {
    risks.push({
      code: "planner-red",
      label: options.plannerDaysLate
        ? `Plan kasni ~${options.plannerDaysLate} dana`
        : "Planer: značajno kašnjenje",
      severity: "critical",
    });
  } else if (options.plannerStatus === "yellow") {
    risks.push({
      code: "planner-yellow",
      label: "Planer: blago kašnjenje",
      severity: "warning",
    });
  }

  risks.sort((a, b) => {
    const rank = (s: ReadinessRisk["severity"]) => (s === "critical" ? 0 : 1);
    return rank(a.severity) - rank(b.severity);
  });

  return {
    score,
    level: readinessLevelFromScore(score),
    coverage: Math.round(WEIGHT_COVERAGE * coveragePct),
    retention: Math.round(WEIGHT_RETENTION * retentionPct),
    health: Math.round(WEIGHT_HEALTH * healthPct),
    coveragePct,
    retentionPct,
    healthPct,
    risks,
    plannerAdjustment,
  };
}
