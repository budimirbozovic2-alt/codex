/**
 * Public API barrel for `@/lib/db/queries`.
 *
 * Hooks consume this barrel directly (see ESLint `no-restricted-imports`
 * override for `src/hooks/**`). UI components remain blocked — they must
 * route through a hook.
 *
 * Walled per architecture memory: deep imports into sibling files are
 * forbidden, the barrel is the single seam.
 */
// PR-9 A1b P1.5 — cards read path (SQLite-primary, Dexie fallback).
export {
  listAllCards,
  getCardsByIds,
  cardsByCategory,
  cardsBySubcategory,
  cardsByChapter,
  cardsByType,
  cardsBySource,
  cardsByTag,
  cardCountByCategory,
  cardCountByChapter,
  cardCountByType,
  onCardsChanged,
  notifyCardsChanged,
  getRecentCorruptCardIds,
  onCorruptCards,
} from "./cards";
export type { CardsScope } from "./cards";
export {
  clearCardsSubcategoryRefs,
  clearCardsChapterRefs,
  reassignCardsSubcategory,
} from "./cards-bulk-mutations";


// A1c-4 F2 — legacy `idbLoadSettings`/`idbSaveSettings` aliases removed.
// Callers must use `getSetting` / `putSetting` from this barrel (re-exported
// further down) or go through `settingsRepository`.

// PR-9 M3 — SQLite-primary read/write repos.
export {
  loadPlannerSnapshot,
  savePlannerConfig,
  saveDailyMapped,
  saveLastRedistribute,
  saveDisciplineLog as savePlannerDisciplineLog,
} from "./planner";
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
  listArticlesBySubject,
  findArticleByTitle,
  putArticle as putKnowledgeBaseArticle,
  bulkPutArticles as bulkPutKnowledgeBaseArticles,
  deleteArticle as deleteKnowledgeBaseArticle,
  onKnowledgeBaseChanged,
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
// PR-9 A1c-3 nastavak — log tables (reviewLog/pomodoroLog/diary/
// calibrationLog/latencyLog/slippageLog/activityLog) SQLite-primary.
// F6.3 cleanup: `clear*` and unused `bulkPut*` (everything except
// `bulkPutReviewLog`) removed — restore writes inline via
// `writeSatelliteTablesTx`, runtime appends go through `add*Entry`.
export {
  listAllReviewLog, countReviewLog, bulkPutReviewLog, loadRecentReviewLog,
  listAllPomodoroLog, countPomodoroLog, addPomodoroLogEntry, loadPomodoroLogSince, countPomodoroLogByType,

  listAllDiary, countDiary,
  listAllCalibrationLog, countCalibrationLog,
  listAllLatencyLog, countLatencyLog,
  listAllSlippageLog, countSlippageLog,
  listAllActivityLog, countActivityLog,
  // F6.2 — windowed reads, single-row add, prune.
  loadCalibrationLogSince, loadLatencyLogSince, loadActivityLogSince, loadSlippageLogSinceDate,
  addCalibrationLogEntry, addLatencyLogEntry, addActivityLogEntry, addSlippageLogEntry,
  pruneAutoIncTable,
} from "./logs";


// A1c-4 F1 — categories aggregate root (SQLite-primary).
export {
  listAllCategories,
  getCategory,
  countCategories,
  replaceAllCategories,
  putCategory,
  bulkPutCategories,
  clearCategories,
} from "./categories";
// PR-9 A1b P1.B — consolidated backup/health read seam (SQLite-primary
// where possible, explicit Dexie read-replicas where not yet migrated).
export * from "./backup-readers";

// PR-9 A1c-0 — executor miss telemetry (pre-condition gate for dropping
// the Dexie mirror). Aggregate count must stay at 0 for one soak cycle
// before A1c-1 may delete the fallback branches.
export {
  getExecutorMissCounts,
  getTotalExecutorMisses,
  onExecutorMiss,
} from "./_shared/executor-telemetry";
export type { ExecutorMissReason } from "./_shared/executor-telemetry";
