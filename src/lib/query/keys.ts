/**
 * Stable, typed query keys for TanStack Query.
 *
 * PR-7f M1 — sources + planner. Druge domene (cards, mindMaps, backlink)
 * dolaze u PR-7g.
 */

export const queryKeys = {
  sources: {
    root: ["sources"] as const,
    all: () => ["sources", "all"] as const,
    byCategory: (categoryId: string) => ["sources", "cat", categoryId] as const,
  },
  planner: {
    root: ["planner"] as const,
    config: () => ["planner", "config"] as const,
    disciplineLog: () => ["planner", "discipline", "log"] as const,
    disciplineTrend: (days: number) =>
      ["planner", "discipline", "trend", days] as const,
    phaseDisciplinePct: () =>
      ["planner", "discipline", "phasePct"] as const,
    velocity: (reviewLogHash: string, windowDays: number) =>
      ["planner", "velocity", reviewLogHash, windowDays] as const,
    subjectPlans: (configHash: string, categoryHash: string, cardsHash: string) =>
      ["planner", "plans", configHash, categoryHash, cardsHash] as const,
    smartSuggestion: (cardsHash: string, finalGoalDate: string, velocity: number | null, buffer: number) =>
      ["planner", "suggestion", cardsHash, finalGoalDate, velocity, buffer] as const,
    timeRec: (suggested: number | null, velocity: number | null, dueCount: number) =>
      ["planner", "timeRec", suggested, velocity, dueCount] as const,
    burnup: (reviewLogHash: string, totalSections: number, finalGoalDate: string, buffer: number) =>
      ["planner", "burnup", reviewLogHash, totalSections, finalGoalDate, buffer] as const,
    projectionText: (velocity: number | null, remaining: number, finalGoalDate: string, buffer: number) =>
      ["planner", "projection", velocity, remaining, finalGoalDate, buffer] as const,
    retentionRisk: (cardsHash: string, categoryHash: string, finalGoalDate: string | null) =>
      ["planner", "retention", cardsHash, categoryHash, finalGoalDate] as const,
    estimatedFinish: (remaining: number, velocity: number | null) =>
      ["planner", "estimatedFinish", remaining, velocity] as const,
    plannerStatus: (estimatedFinish: number | null, finalGoalDate: string, buffer: number) =>
      ["planner", "status", estimatedFinish, finalGoalDate, buffer] as const,
  },
} as const;
