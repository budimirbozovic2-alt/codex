/**
 * Public API barrel for `@/lib/db/queries`.
 *
 * Hooks consume this barrel directly (see ESLint 
 * `no-restricted-imports` override for `src/hooks/**`). 
 * UI components remain blocked — they must route through a hook.
 *
 * Walled per architecture memory: deep imports into sibling 
 * files are forbidden, the barrel is the single seam.
 */

export type { CardsScope, MasteryDistribution } from "./cards";

export {
  cardToScopeRef,
  emitCardsChanged,
  emitCardsChangedForCard,
  emitCardsChangedForCategoryIds,
  emitCardsChangedForRefs,
  emitCardsChangedForTransition,
  emitAfterCardWrite,
  fetchCardScopeRefs,
} from "./cards-notify-scope";
export type { CardScopeRef } from "./cards-notify-scope";

// Cards read path — SQLite SSOT
export {
  listAllCards,
  getCardsByIds,
  getDueCardsFromDb,
  countDueCardsFromDb,
  countDueCardsByCategoryFromDb,
  avgMasteryScoreByCategoryFromDb,
  masteryDistributionByCategoryFromDb,
  cardsByCategory,
  cardsBySubcategory,
  cardsByChapter,
  cardsByType,
  cardsBySource,
  cardsByTag,
  countAllCards,
  cardCountByCategory,
  cardCountByChapter,
  cardCountByType,
  countEndangeredEssaysByCategoryFromDb,
  countEndangeredEssaysAllFromDb,
  onCardsChanged,
  notifyCardsChanged,
  getRecentCorruptCardIds,
  onCorruptCards,
} from "./cards";

export {
  clearCardsSubcategoryRefs,
  clearCardsChapterRefs,
  reassignCardsSubcategory,
} from "./cards-bulk-mutations";

// PR-E1 — direct SQLite write helpers
export {
  putCardDirect,
  bulkPutCardsDirect,
  deleteCardDirect,
  clearCardLinksDirect,
  clearCardNeedsReviewDirect,
  snapshotAllCards,
} from "./cards-writes";

// PR-9 M3 — SQLite-primary read/write repos.
export {
  loadPlannerSnapshot,
  savePlannerConfig,
  saveDailyMapped,
  saveLastRedistribute,
  saveDisciplineLog as savePlannerDisciplineLog,
} from "./planner";

// VRATIO: Ponovo vuče iz lokalnog drafts fajla
export {
  getDraft,
  putDraft,
  deleteDraft,
  bulkDeleteDrafts,
  listDraftsBySource,
  listAllDrafts,
  onDraftsChanged,
} from "./drafts";

export {
  getSetting,
  putSetting,
  deleteSetting,
  listSettingsByPrefix,
  onSettingsChanged,
} from "./settings";

export {
  loadAllLearnProgress,
  replaceAllLearnProgress,
  clearLearnProgress,
} from "./learn-progress";

export {
  getSource,
  listAllSources,
  countAllSources,
  listSourcesByCategory,
  putSource,
  deleteSourceAndUnlinkCards,
} from "./sources";

export {
  getMindMap,
  listAllMindMaps,
  countAllMindMaps,
  listMindMapsByCategory,
  putMindMap,
  deleteMindMap,
} from "./mind-maps";

export {
  getMnemonic,
  listAllMnemonics,
  listMnemonicsByCategory,
  putMnemonic,
  bulkPutMnemonics,
  deleteMnemonic,
} from "./mnemonics";

export {
  getArticle as getKnowledgeBaseArticle,
  listAllArticles as listAllKnowledgeBaseArticles,
  listArticlesBySubject,
  findArticleByTitle,
  putArticle as putKnowledgeBaseArticle,
  bulkPutArticles as bulkPutKnowledgeBaseArticles,
  deleteArticle as deleteKnowledgeBaseArticle,
  notifyKnowledgeBaseChanged,
} from "./knowledge-base";

// PR-9 A1b P1.6 — mnemonic aux tables (Major System + test log).
export {
  listAllPegs as listAllMajorSystemPegs,
  bulkPutPegs as bulkPutMajorSystemPegs,
} from "./major-system";
export type { MajorSystemPeg } from "./major-system";

export {
  listAllTestLogEntries,
  listTestLogEntriesByCard,
  addTestLogEntry,
} from "./mnemonic-test-log";

// Raščlanjeni i formatirani satelitski logovi baze podataka
export {
  listAllReviewLog,
  countReviewLog,
  bulkPutReviewLog,
  loadRecentReviewLog,
  listAllPomodoroLog,
  countPomodoroLog,
  addPomodoroLogEntry,
  loadPomodoroLogSince,
  countPomodoroLogByType,
  listAllDiary,
  countDiary,
  listAllCalibrationLog,
  countCalibrationLog,
  listAllLatencyLog,
  countLatencyLog,
  listAllSlippageLog,
  countSlippageLog,
  listAllActivityLog,
  countActivityLog,
  loadCalibrationLogSince,
  loadLatencyLogSince,
  loadActivityLogSince,
  loadSlippageLogSinceDate,
  addCalibrationLogEntry,
  addLatencyLogEntry,
  addActivityLogEntry,
  addSlippageLogEntry,
  pruneAutoIncTable,
} from "./logs";

// A1c-4 F1 — categories aggregate root
export {
  listAllCategories,
  getCategory,
  countCategories,
  replaceAllCategories,
  putCategory,
  bulkPutCategories,
  clearCategories,
  notifyCategoriesChanged,
  onCategoriesChanged,
} from "./categories";
export type { CategoriesScope } from "./categories";

export * from "./backup-readers";

// PR-9 A1c-0 — executor miss telemetry
export {
  getExecutorMissCounts,
  getTotalExecutorMisses,
  onExecutorMiss,
} from "./_shared/executor-telemetry";
export type { 
  ExecutorMissReason 
} from "./_shared/executor-telemetry";