/**
 * Stable, typed query keys for TanStack Query.
 *
 * PR-7f M1 — sources + planner. Druge domene (cards, mindMaps, backlink)
 * dolaze u PR-7g.
 *
 * S5 (Phase 3) — planner keys više ne sadrže hash inpute. Cache nikad ne
 * akumulira po varijabilnim dimenzijama; jedan slot po query tipu.
 * Trigger refetcha je `useEffect` u `usePlannerData` koji zove
 * `qc.invalidateQueries` čim se hash promijeni.
 */

export const queryKeys = {
  sources: {
    root: ["sources"] as const,
    all: () => ["sources", "all"] as const,
    byCategory: (categoryId: string) => ["sources", "cat", categoryId] as const,
  },
  cards: {
    root: ["cards"] as const,
    all: () => ["cards", "all"] as const,
    byCategory: (categoryId: string) => ["cards", "cat", categoryId] as const,
    bySubcategory: (categoryId: string, subcategoryId: string) =>
      ["cards", "subcat", categoryId, subcategoryId] as const,
    byChapter: (categoryId: string, chapterId: string) =>
      ["cards", "chap", categoryId, chapterId] as const,
    byType: (categoryId: string, type: string) =>
      ["cards", "type", categoryId, type] as const,
    bySource: (sourceId: string) => ["cards", "source", sourceId] as const,
    countByCategory: (categoryId: string) =>
      ["cards", "count", "cat", categoryId] as const,
  },
  planner: {
    root: ["planner"] as const,
    config: () => ["planner", "config"] as const,
    disciplineLog: () => ["planner", "discipline", "log"] as const,
    disciplineTrend: (days: number) =>
      ["planner", "discipline", "trend", days] as const,
    phaseDisciplinePct: () => ["planner", "discipline", "phasePct"] as const,
    velocity: () => ["planner", "velocity"] as const,
    subjectPlans: () => ["planner", "plans"] as const,
    smartSuggestion: () => ["planner", "suggestion"] as const,
    timeRec: () => ["planner", "timeRec"] as const,
    burnup: () => ["planner", "burnup"] as const,
    projectionText: () => ["planner", "projection"] as const,
    retentionRisk: () => ["planner", "retention"] as const,
    estimatedFinish: () => ["planner", "estimatedFinish"] as const,
    plannerStatus: () => ["planner", "status"] as const,
  },
  mindMaps: {
    root: ["mindMaps"] as const,
    all: () => ["mindMaps", "all"] as const,
    byCategory: (categoryId: string) => ["mindMaps", "cat", categoryId] as const,
    byId: (id: string) => ["mindMaps", "id", id] as const,
  },
  mnemonics: {
    root: ["mnemonics"] as const,
    all: () => ["mnemonics", "all"] as const,
    byCategory: (categoryId: string) => ["mnemonics", "cat", categoryId] as const,
    majorSystem: () => ["mnemonics", "majorSystem"] as const,
    testLog: () => ["mnemonics", "testLog"] as const,
    testLogByCard: (cardId: string) => ["mnemonics", "testLog", "card", cardId] as const,
  },
  knowledgeBase: {
    root: ["knowledgeBase"] as const,
    all: () => ["knowledgeBase", "all"] as const,
    byCategory: (subjectId: string) => ["knowledgeBase", "cat", subjectId] as const,
    byId: (id: string) => ["knowledgeBase", "id", id] as const,
  },
} as const;
