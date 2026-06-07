/**
 * Stable, typed query keys for TanStack Query.
 *
 * PR-H7 Hardening: Exposed prefix roots for fuzzy
 * bridge invalidations and fixed subject semantics.
 */

export const queryKeys = {
  sources: {
    root: ["sources"] as const,
    all: () => ["sources", "all"] as const,
    byCategory: (categoryId: string) => 
      ["sources", "cat", categoryId] as const,
  },
  cards: {
    root: ["cards"] as const,
    all: () => ["cards", "all"] as const,
    byCategory: (categoryId: string) => 
      ["cards", "cat", categoryId] as const,
    
    // PR-H7: Prefiksni kljucevi za fuzzy bridges.ts
    _subcatRoot: (categoryId: string) =>
      ["cards", "subcat", categoryId] as const,
    _chapRoot: (categoryId: string) =>
      ["cards", "chap", categoryId] as const,
    _typeRoot: (categoryId: string) =>
      ["cards", "type", categoryId] as const,
      
    // Lisni precizni kljucevi
    bySubcategory: (
      categoryId: string, 
      subcategoryId: string
    ) => [
      "cards", "subcat", categoryId, subcategoryId
    ] as const,
    byChapter: (
      categoryId: string, 
      chapterId: string
    ) => [
      "cards", "chap", categoryId, chapterId
    ] as const,
    byType: (
      categoryId: string, 
      type: string
    ) => [
      "cards", "type", categoryId, type
    ] as const,
    bySource: (sourceId: string) => 
      ["cards", "source", sourceId] as const,
    countByCategory: (categoryId: string) =>
      ["cards", "count", "cat", categoryId] as const,
  },
  planner: {
    root: ["planner"] as const,
    config: () => ["planner", "config"] as const,
    disciplineLog: () => 
      ["planner", "discipline", "log"] as const,
    disciplineTrend: (days: number) => [
      "planner", "discipline", "trend", days
    ] as const,
    phaseDisciplinePct: () => 
      ["planner", "discipline", "phasePct"] as const,
    velocity: () => ["planner", "velocity"] as const,
    subjectPlans: () => ["planner", "plans"] as const,
    smartSuggestion: () => ["planner", "suggestion"] as const,
    timeRec: () => ["planner", "timeRec"] as const,
    burnup: () => ["planner", "burnup"] as const,
    projectionText: () => ["planner", "projection"] as const,
    retentionRisk: () => ["planner", "retention"] as const,
    estimatedFinish: () => 
      ["planner", "estimatedFinish"] as const,
    plannerStatus: () => ["planner", "status"] as const,
  },
  mindMaps: {
    root: ["mindMaps"] as const,
    all: () => ["mindMaps", "all"] as const,
    byCategory: (categoryId: string) => 
      ["mindMaps", "cat", categoryId] as const,
    byId: (id: string) => ["mindMaps", "id", id] as const,
  },
  mnemonics: {
    root: ["mnemonics"] as const,
    all: () => ["mnemonics", "all"] as const,
    byCategory: (categoryId: string) => 
      ["mnemonics", "cat", categoryId] as const,
    majorSystem: () => ["mnemonics", "majorSystem"] as const,
    testLog: () => ["mnemonics", "testLog"] as const,
    testLogByCard: (cardId: string) => 
      ["mnemonics", "testLog", "card", cardId] as const,
  },
  knowledgeBase: {
    root: ["knowledgeBase"] as const,
    all: () => ["knowledgeBase", "all"] as const,
    // PR-H7: Ispravljeno semanticko ime (Subject umjesto Category)
    bySubject: (subjectId: string) => 
      ["knowledgeBase", "cat", subjectId] as const,
    byId: (id: string) => ["knowledgeBase", "id", id] as const,
  },
} as const;